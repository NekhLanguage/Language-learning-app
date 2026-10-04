// tests/dev-server.mjs
//
// Zero-dependency local server for development and e2e tests.
// Serves the repo's static files with correct MIME types (including .mjs,
// which Netlify handles via netlify.toml headers in production) and stubs
// every /.netlify/functions/* endpoint the front-end calls, so the app runs
// fully offline — no Supabase, no Google TTS, no network.
//
// Usage:
//   node tests/dev-server.mjs            # http://127.0.0.1:8888
//   PORT=3000 node tests/dev-server.mjs
//
// Stub behavior (kept faithful to the real functions' response shapes):
//   GET  /.netlify/functions/authConfig   -> {stub:true}: auth.mjs keeps a
//        fake session in localStorage (any email + any password signs in,
//        a password containing "wrongpassword" is rejected) and sends
//        `Authorization: Bearer stub-token:<email>`; the stubs below read
//        the caller's email from that header, like the real functions read
//        it from the verified Supabase session.
//   POST /.netlify/functions/authProvision {email, emailOptIn} -> {ok:true};
//        records the weekly-email answer for a NEW address (first call wins,
//        like the real function's user_metadata on account creation).
//   POST /.netlify/functions/emailOptIn {optIn} -> the one-time in-app
//        answer for a free-tier learner never asked on the form (Google).
//        A ticked answer, either path, lands the email in the stub
//        MailerLite list; an unticked one never does.
//   GET  /__devserver/optins -> { optIns: {email: {askedAt, optInAt,
//        source}}, mailerlite: [emails handed to app-trial] }.
//   GET/POST /.netlify/functions/referral -> the learner's referral code,
//        link and (zero) stats; POST {accept:true} creates the code for a
//        subscriber (email without "nosub"/"noaccess").
//   POST /.netlify/functions/checkAccess  -> {allowed, email, subscribed}
//        401 without a token; allowed=false when the email contains
//        "noaccess" (lets tests cover the rejection path); subscribed=false
//        when it contains "nosub"; true otherwise.
//   POST /.netlify/functions/loadUser     -> {user} for the token's email
//        from the in-memory store (null when unknown, like a fresh account).
//   POST /.netlify/functions/saveUser     {user} -> {ok:true}; stores the
//        blob under the token's email so a later loadUser round-trips it.
//   POST /.netlify/functions/beacon       -> 204 (analytics sink).
//   POST /.netlify/functions/submitBug    -> {ok:true}.
//   GET  /.netlify/functions/tts          -> a tiny silent MP3 (audio/mpeg),
//        so <audio> playback resolves without hitting Google Cloud.
//   GET  /__devserver/users               -> the in-memory user store, so
//        tests can assert on what the app synced.
//   GET/POST /.netlify/functions/leaderboard -> the board: counters are
//        computed from the stored blobs with the real leaderboardStats.js;
//        POST {name} joins / renames (409 when another learner holds the
//        name, case-insensitively), POST {leave:true} leaves.
//
// Free tier (2026-09-30): an email containing "trial" is a free-tier
// account (checkAccess tier "trial", Anna refused, saveUser refuses a blob
// past lesson 3 with 403 like the real function). trial_start is recorded
// on its first checkAccess.
//   POST /.netlify/functions/trialEvent  {type, lesson?} -> 204; recorded.
//   GET  /__devserver/events               -> recorded funnel events.
//   POST /__devserver/convert?email=…      -> simulate the Stripe webhook:
//        the account becomes paid (trial_convert recorded).
//   POST /__devserver/trialEventFailNext?n=N -> the next N trialEvent POSTs
//        return 503, so the client's localStorage-queue retry can be tested.

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeLeaderboardStats, normalizeDisplayName, MIN_NAME, MAX_NAME } =
  require("../netlify/functions/leaderboardStats.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8888);
const HOST = "127.0.0.1";
const QUIET = process.env.DEV_SERVER_QUIET === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

// One silent MPEG-1 Layer III frame (~26ms of silence) — enough for
// Audio.play() to succeed in the browser without real synthesis.
const SILENT_MP3 = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x64]),
  Buffer.alloc(413, 0),
]);

// email -> user blob, mirroring the Supabase `users.data` column.
const userStore = new Map();
// Free-tier stub state: converted emails, provisioned trials, funnel rows.
const convertedEmails = new Set();
const trialStarted = new Set();
const funnelEvents = [];
// Email consent stub: email -> { askedAt, optInAt, source } (users.email_opt_in_*),
// and the addresses handed to MailerLite's app-trial group (ticked only).
const optIns = new Map();
const mailerlite = [];
const handToMailerlite = (email) => { if (!mailerlite.includes(email)) mailerlite.push(email); };
const FREE_LESSONS = 3;
const isTrialEmail = (email) => !!email && email.includes("trial") && !convertedEmails.has(email);
const maxReleasedLessons = (user) => Math.max(0, ...Object.values((user && user.runs) || {})
  .map((r) => (Array.isArray(r && r.releasedBundleIds) ? r.releasedBundleIds.length : 0)));
// email -> referral code (referral stub).
const referralCodes = new Map();
// email -> leaderboard display name (users.lb_name in production).
const leaderboardNames = new Map();
const LEADERBOARD_TOP = 25;
// Chat texts carrying __FAIL_ONCE__ that have already failed once (tutor stub).
const tutorFailedOnce = new Set();
// How many of the next trialEvent POSTs to answer with a 503, set via
// POST /__devserver/trialEventFailNext?n=N. Decrements per failed request.
// Exists so the e2e can exercise the localStorage-queue retry path.
let trialEventFailNext = 0;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// The email behind a stub bearer token (`stub-token:<email>`), or "" when
// the request carries none — mirrors netlify/functions/auth.js verifySession.
function sessionEmail(req) {
  const raw = String(req.headers.authorization || "");
  const m = /^Bearer\s+stub-token:(.+)$/i.exec(raw.trim());
  return m ? m[1].toLowerCase().trim() : "";
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function handleFunction(name, req, res, url) {
  const raw = req.method === "GET" ? "" : await readBody(req);
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // The real functions 400 on bad JSON; the front-end never sends it.
    return sendJson(res, 400, { error: "Invalid JSON" });
  }

  const email = sessionEmail(req);

  switch (name) {
    case "authConfig": {
      return sendJson(res, 200, { stub: true });
    }
    case "authProvision": {
      const who = String(body.email || "").toLowerCase().trim();
      if (who && !optIns.has(who)) {
        const now = new Date().toISOString();
        optIns.set(who, { askedAt: now, optInAt: body.emailOptIn === true ? now : null, source: "signup-form" });
      }
      return sendJson(res, 200, { ok: true });
    }
    case "emailOptIn": {
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      const prev = optIns.get(email);
      const now = new Date().toISOString();
      if (!prev || !prev.optInAt) {
        const optInAt = body.optIn === true ? now : null;
        optIns.set(email, { askedAt: now, optInAt, source: "prompt" });
        if (optInAt) handToMailerlite(email);
      }
      return sendJson(res, 200, { ok: true, optedIn: !!optIns.get(email).optInAt, emailOptInAsked: true });
    }
    case "referral": {
      // Referral code + stats for the signed-in learner. Subscribers
      // (no "nosub"/"noaccess" in the email) may create a code with
      // POST {accept:true}; stats are zeros in the stub.
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      const eligible = !email.includes("noaccess") && !email.includes("nosub");
      const stats = { activeReferrals: 0, availableCents: 0, appliedCents: 0, appliedThisYearCents: 0, lifetimeCents: 0 };
      const config = { rateBps: 2000, capCents: 19000, monthlyPriceCents: 1900 };
      const state = () => {
        const code = referralCodes.get(email) || null;
        return {
          code,
          link: code ? `https://buy.stripe.com/00w00i2G0ekMblW6WI9sk05?client_reference_id=${code}` : null,
          eligible,
          acceptedTermsAt: code ? new Date().toISOString() : null,
          stats,
          config,
        };
      };
      if (req.method === "GET") return sendJson(res, 200, state());
      if (body.accept !== true) return sendJson(res, 400, { error: "Accept the referral terms to get a code" });
      if (!eligible && !referralCodes.has(email)) return sendJson(res, 403, { error: "Referral codes are for active subscribers", ...state() });
      if (!referralCodes.has(email)) {
        referralCodes.set(email, "ZTH-" + email.split("@")[0].replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8));
      }
      return sendJson(res, 200, state());
    }
    case "leaderboard": {
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      const limits = { minName: MIN_NAME, maxName: MAX_NAME, top: LEADERBOARD_TOP };
      const rowFor = (e) => {
        const stats = computeLeaderboardStats(userStore.get(e) || null);
        return { name: leaderboardNames.get(e) || null, words: stats.words, anna: stats.anna };
      };
      const joined = () => [...leaderboardNames.keys()].map(rowFor);
      const top = (col) => joined().sort((a, b) => b[col] - a[col]).slice(0, LEADERBOARD_TOP);
      const me = () => {
        const r = rowFor(email);
        if (!r.name) return { joined: false, name: null, words: r.words, anna: r.anna, rankWords: null, rankAnna: null };
        const all = joined();
        return {
          joined: true, name: r.name, words: r.words, anna: r.anna,
          rankWords: all.filter((x) => x.words > r.words).length + 1,
          rankAnna: all.filter((x) => x.anna > r.anna).length + 1,
        };
      };
      if (req.method === "GET") {
        return sendJson(res, 200, { top: { words: top("words"), anna: top("anna") }, me: me(), limits });
      }
      if (body.leave === true) {
        leaderboardNames.delete(email);
        return sendJson(res, 200, { me: me(), limits });
      }
      const name = normalizeDisplayName(body.name);
      if (!name) {
        return sendJson(res, 400, { error: `Pick a name between ${MIN_NAME} and ${MAX_NAME} characters, without < > & or quotes.`, code: "bad_name" });
      }
      for (const [e, n] of leaderboardNames) {
        if (e !== email && n.toLowerCase() === name.toLowerCase()) {
          return sendJson(res, 409, { error: "That name is already taken — try another.", code: "name_taken" });
        }
      }
      leaderboardNames.set(email, name);
      return sendJson(res, 200, { me: me(), limits });
    }
    case "checkAccess": {
      if (!email) return sendJson(res, 401, { allowed: false, error: "Sign in required", code: "unauthenticated" });
      const trial = isTrialEmail(email);
      if (trial && !trialStarted.has(email)) {
        trialStarted.add(email);
        funnelEvents.push({ event_type: "trial_start", email, props: null });
        // The sign-up form's answer rides onto the row at provisioning;
        // a ticked box is the only thing that reaches MailerLite.
        const consent = optIns.get(email);
        if (consent && consent.optInAt) handToMailerlite(email);
      }
      return sendJson(res, 200, {
        allowed: !email.includes("noaccess"),
        email,
        tier: trial ? "trial" : "paid",
        freeLessons: FREE_LESSONS,
        subscribed: !trial && !email.includes("noaccess") && !email.includes("nosub"),
        emailOptInAsked: !trial || optIns.has(email),
      });
    }
    case "loadUser": {
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      return sendJson(res, 200, { user: userStore.get(email) ?? null });
    }
    case "saveUser": {
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      if (isTrialEmail(email) && maxReleasedLessons(body.user) > FREE_LESSONS) {
        return sendJson(res, 403, { error: "Lesson 4 onward needs the full app.", code: "paywall" });
      }
      if (body.user) userStore.set(email, body.user);
      return sendJson(res, 200, { ok: true });
    }
    case "trialEvent": {
      const allowedTypes = ["trial_lesson_complete", "paywall_hit", "trial_anna_intro_seen"];
      if (!allowedTypes.includes(body.type)) return sendJson(res, 400, { error: "Unknown event" });
      // Failure injection for the retry e2e: the real function returned 503
      // during Emi's Run 28 burst and lost the row. The queue must recover.
      if (trialEventFailNext > 0) {
        trialEventFailNext -= 1;
        return sendJson(res, 503, { error: "injected 503" });
      }
      if (isTrialEmail(email)) {
        funnelEvents.push({ event_type: body.type, email, props: body.lesson ? { lesson: body.lesson } : null });
      }
      res.writeHead(204);
      return res.end();
    }
    case "beacon": {
      res.writeHead(204);
      return res.end();
    }
    case "submitBug": {
      return sendJson(res, 200, { ok: true });
    }
    case "tutor": {
      // Canned tutor so the chat page works offline. Ping mirrors the real
      // allowlist shape; chat mode echoes; summary mode returns one fake new
      // word so the personal-vocab path is exercised.
      if (body.mode === "ping") {
        if (!email) return sendJson(res, 200, { allowed: false, vocabWriteback: false, beta: {}, reason: "unauthenticated" });
        const subscribed = !isTrialEmail(email) && !email.includes("noaccess") && !email.includes("nosub");
        // vocabWriteback mirrors production's ships-OFF default. Beta
        // features (production: BETA_EMAILS) are on for emails containing
        // "beta", e.g. beta@example.com.
        const beta = { topics: subscribed && email.includes("beta") };
        return sendJson(res, 200, { allowed: subscribed, vocabWriteback: false, subscribed, beta });
      }
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      if (body.mode === "admissions") {
        return sendJson(res, 200, { ok: true, count: (body.admissions || []).length });
      }
      // Failure injection for the retry e2e tests. Markers in the learner's
      // text: __FAIL_ONCE__ fails the first chat request carrying it and
      // succeeds on the retry; __FAIL_ALWAYS__ fails every chat request;
      // __SUMMARY_FAIL__ anywhere in the transcript fails the summary.
      const transcript = (Array.isArray(body.messages) ? body.messages : [])
        .map((m) => String(m?.content || ""));
      const lastText = transcript.length ? transcript[transcript.length - 1] : "";
      if (body.mode === "summary" && transcript.some((t) => t.includes("__SUMMARY_FAIL__"))) {
        return sendJson(res, 502, { error: "injected summary failure" });
      }
      if (body.mode !== "summary" && lastText.includes("__FAIL_ALWAYS__")) {
        return sendJson(res, 502, { error: "injected chat failure" });
      }
      if (body.mode !== "summary" && lastText.includes("__FAIL_ONCE__") && !tutorFailedOnce.has(lastText)) {
        tutorFailedOnce.add(lastText);
        return sendJson(res, 502, { error: "injected chat failure (once)" });
      }
      if (body.mode === "summary") {
        // Real notes take 10-30 s; a short stub delay keeps End session's
        // save-first-notes-later order observable in the e2e tests.
        await new Promise((r) => setTimeout(r, 700));
        return sendJson(res, 200, {
          summary: {
            sessionSummary: "Dev-stub session: practiced greetings.",
            wins: ["Greeted confidently"],
            struggles: ["Verb endings"],
            newWords: [{
              word: "mercado",
              translation: "market",
              note: "dev stub word",
              pos: "noun",
              exampleSentence: "Vou ao mercado hoje.",
              exampleTranslation: "I'm going to the market today.",
            }],
            nextFocus: "Keep practicing verb endings.",
            // Extension for the learner-facts write-path (schema v3): the
            // real function's summary schema requires these; the stub
            // returns one canonical fact so the client's applyTutorLearnerFacts
            // path is exercised offline.
            // The learner's own out-of-profile words (Nekh 2026-09-26).
            learnerWords: [],
            newLearnerFacts: ["Dev-stub learner facts write-path is wired."],
            correctedLearnerFacts: [],
            // Topics beta: the real function adds these only when the
            // request carries `topics`. The stub keeps the active topic
            // (ACTIVE TOPIC id in the block), or starts "Dev stub topic"
            // for a free conversation, and proposes one parent topic.
            ...(typeof body.topics === "string" ? (() => {
              const active = /ACTIVE TOPIC: "[^"]*" \(id ([^)]+)\)/.exec(body.topics)?.[1] || "";
              const ids = [...body.topics.matchAll(/^\s*- (t_\S+) — /gm)].map((m) => m[1]);
              return {
                topic: {
                  assignedTopicId: active,
                  newTopicName: active ? "" : "Dev stub topic",
                  topicNotes: "Dev-stub topic notes: talked about chapter 1.",
                },
                proposedTopics: [{
                  name: "Books in general",
                  question: "Should I group these under a broader topic, Books in general?",
                  groupsTopicIds: ids,
                }],
              };
            })() : {}),
          },
        });
      }
      return sendJson(res, 200, {
        reply: `Olá! (dev stub tutor in ${body.targetLang || "?"}) You said: ${lastText}`,
      });
    }
    case "tutorStream": {
      // Streaming twin of the tutor stub: the same reply, sent as
      // newline-delimited JSON pieces with small gaps so the client's
      // streaming path (typing indicator → growing bubble) is exercised.
      // Honours the same failure markers as the classic stub so the
      // fallback path is exercised too: __FAIL_ALWAYS__ / __FAIL_ONCE__
      // fail before the stream opens; __STREAM_CUT__ dies mid-reply.
      if (!email) return sendJson(res, 401, { error: "Sign in required", code: "unauthenticated" });
      const transcript = (Array.isArray(body.messages) ? body.messages : []).map((m) => String(m?.content || ""));
      const lastText = transcript.length ? transcript[transcript.length - 1] : "";
      if (lastText.includes("__FAIL_ALWAYS__")) return sendJson(res, 502, { error: "injected stream failure" });
      if (lastText.includes("__FAIL_ONCE__") && !tutorFailedOnce.has(lastText)) {
        tutorFailedOnce.add(lastText);
        return sendJson(res, 502, { error: "injected stream failure (once)" });
      }
      const reply = `Olá! (dev stub tutor in ${body.targetLang || "?"}) You said: ${lastText}`;
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
      const pieces = reply.match(/\S+\s*/g) || [reply];
      const cut = lastText.includes("__STREAM_CUT__") ? Math.max(1, Math.floor(pieces.length / 2)) : pieces.length;
      for (let i = 0; i < cut; i++) {
        res.write(`${JSON.stringify({ t: pieces[i] })}\n`);
        await new Promise((r) => setTimeout(r, 40));
      }
      if (cut < pieces.length) res.write(`${JSON.stringify({ error: "injected mid-stream failure" })}\n`);
      else res.write(`${JSON.stringify({ done: true })}\n`);
      return res.end();
    }
    case "tts": {
      const text = url.searchParams.get("text") || body.text || "";
      if (!text) return sendJson(res, 400, { error: "Missing text" });
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      });
      return res.end(SILENT_MP3);
    }
    default:
      return sendJson(res, 404, { error: `No stub for function "${name}"` });
  }
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(ROOT, pathname);
  // Keep path traversal (/../..) inside the repo root.
  if (!filePath.startsWith(ROOT + path.sep)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return sendJson(res, 404, { error: `Not found: ${pathname}` });
  }

  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (!QUIET) console.log(`${req.method} ${url.pathname}`);

  try {
    const fnMatch = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
    if (fnMatch) return await handleFunction(fnMatch[1], req, res, url);

    if (url.pathname === "/__devserver/users") {
      return sendJson(res, 200, Object.fromEntries(userStore));
    }
    if (url.pathname === "/__devserver/events") {
      return sendJson(res, 200, funnelEvents);
    }
    if (url.pathname === "/__devserver/optins") {
      return sendJson(res, 200, { optIns: Object.fromEntries(optIns), mailerlite });
    }
    if (url.pathname === "/__devserver/convert" && req.method === "POST") {
      const who = String(url.searchParams.get("email") || "").toLowerCase();
      if (isTrialEmail(who)) funnelEvents.push({ event_type: "trial_convert", email: who, props: null });
      convertedEmails.add(who);
      return sendJson(res, 200, { ok: true });
    }
    // Arm the next N trialEvent POSTs to return 503; the client should
    // enqueue and replay them after the next successful send.
    if (url.pathname === "/__devserver/trialEventFailNext" && req.method === "POST") {
      const n = Math.max(0, Number(url.searchParams.get("n")) || 0);
      trialEventFailNext = n;
      return sendJson(res, 200, { ok: true, failNext: n });
    }

    // The repo ships no favicon; answer the browser's automatic request
    // quietly so test logs stay free of 404 noise.
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    return await serveStatic(req, res, url);
  } catch (err) {
    console.error("dev-server error:", err);
    return sendJson(res, 500, { error: String(err && err.message) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Zero to Hero dev server: http://${HOST}:${PORT} (root: ${ROOT})`);
});
