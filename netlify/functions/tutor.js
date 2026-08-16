// AI Tutor Netlify Function.
// Proxies tutor conversations to the Claude API so the API key never reaches
// the browser. Two modes:
//   POST {mode:"chat", email, targetLang, supportLang, profile, preferences,
//         memory, messages:[{role,content}...]}
//     -> {reply}
//   POST {mode:"summary", ...same fields}
//     -> {summary:{sessionSummary, wins, struggles, newWords, nextFocus}}
// The summary powers the app-side session memory and personal-vocabulary
// tracking; structured outputs guarantee it parses.
//
// Access is gated by the same Supabase `users` allowlist as checkAccess.js.
// Requires ANTHROPIC_API_KEY in the function environment; TUTOR_MODEL
// optionally overrides the model.

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

const MODEL = process.env.TUTOR_MODEL || "claude-sonnet-5";

// --- Cost telemetry (public.tutor_sessions) -------------------------------
// One row per messages.create() call so per-user variable cost is measurable
// against the subscription floor. Fire-and-forget: a Supabase hiccup must
// never slow or break the learner's chat.

// Per-1M-token prices in US cents. UPDATE ON ANY MODEL SWAP or Anthropic
// price change (verified against the current price list 2026-08-15; the
// telemetry spec's opus/fable rows were stale and are corrected here).
// claude-sonnet-5 has an intro rate ($2/$10 per MTok) through 2026-08-31;
// the sticker rate below slightly overstates cost until then, which is the
// conservative direction for a pricing-floor decision.
const MODEL_PRICES_CENTS_PER_MTOK = {
  "claude-sonnet-5":           { input: 300,  output: 1500, cache_read: 30,  cache_write: 375  },
  "claude-opus-5":             { input: 500,  output: 2500, cache_read: 50,  cache_write: 625  },
  "claude-haiku-4-5-20251001": { input: 100,  output: 500,  cache_read: 10,  cache_write: 125  },
  "claude-fable-5":            { input: 1000, output: 5000, cache_read: 100, cache_write: 1250 },
};

function costCents(model, usage) {
  const p = MODEL_PRICES_CENTS_PER_MTOK[model];
  if (!p) return 0; // unknown model -> row still lands at 0; a busy user with $0.00 spent flags a missing price entry
  const inTok  = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const cacheR = usage?.cache_read_input_tokens || 0;
  const cacheW = usage?.cache_creation_input_tokens || 0;
  const raw =
    (inTok  * p.input       / 1_000_000) +
    (outTok * p.output      / 1_000_000) +
    (cacheR * p.cache_read  / 1_000_000) +
    (cacheW * p.cache_write / 1_000_000);
  // Round to nearest cent, min 1 if any tokens moved.
  return Math.max(inTok + outTok > 0 ? 1 : 0, Math.round(raw));
}

async function logTutorSession(row) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.warn("tutor_sessions log skipped: SUPABASE_SERVICE_ROLE_KEY unset");
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tutor_sessions`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) console.warn("tutor_sessions insert failed:", res.status, await res.text());
  } catch (err) {
    console.warn("tutor_sessions insert threw:", err);
  }
}

// Request caps — a test feature shouldn't be an open token faucet.
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 2000;
const MAX_PROFILE_CHARS = 20000;
const MAX_MEMORY_CHARS = 8000;
// Learner-facts cap. Client already bounds this via `learner_facts.mjs`'s
// 20-entry hard cap; the byte cap here is a belt-and-braces guard against
// a client-side bug that would otherwise flood the system prompt.
const MAX_LEARNER_FACTS_CHARS = 6000;

let cachedClient = null;
function getClient() {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

let cachedInstructions = null;
function getInstructions() {
  if (cachedInstructions) return cachedInstructions;
  const candidates = [
    path.join(__dirname, "tutor-instructions.md"),
    path.join(process.cwd(), "netlify", "functions", "tutor-instructions.md"),
  ];
  for (const p of candidates) {
    try {
      cachedInstructions = fs.readFileSync(p, "utf8");
      return cachedInstructions;
    } catch {
      // try next candidate
    }
  }
  throw new Error("tutor-instructions.md not found in function bundle");
}

// The tutor is invite-only while in testing, independent of general app
// access. TUTOR_ALLOWED_EMAILS (Netlify env var) is a comma-separated email
// allowlist; unset/empty means NOBODY has access, "*" opens it to every
// app user. Changing it needs no deploy — just edit the env var.
function tutorEnabled(email) {
  const normalized = String(email || "").toLowerCase().trim();
  const allowlist = (process.env.TUTOR_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  if (!allowlist.length) return false;
  if (allowlist.includes("*")) return true;
  return allowlist.includes(normalized);
}

// Vocabulary write-back cohort — independent of tutor access, because the
// beta cohort for write-back may be a subset of tutor users. Same env-var
// allowlist shape as TUTOR_ALLOWED_EMAILS: unset/empty means NOBODY (the
// feature ships OFF), "*" opens it to every tutor user, and adding an email
// needs no deploy. The client reads this via ping at session start.
function writebackEnabled(email) {
  const normalized = String(email || "").toLowerCase().trim();
  const allowlist = (process.env.TUTOR_VOCAB_WRITEBACK_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  if (!allowlist.length) return false;
  if (allowlist.includes("*")) return true;
  return allowlist.includes(normalized);
}

async function hasAccess(email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}&select=email`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) {
    console.error("Supabase error:", res.status, await res.text());
    return false;
  }
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

// The per-learner context block. Rendered after the (cached) instructions so
// the instructions prefix stays byte-identical across all learners.
//
// Order is load-bearing: LEARNER FACTS come first, verbatim, so identity /
// subject ground truth ("learner is Norwegian teaching in Norway",
// "Pokémon is a video-game franchise, not real animals") never has to
// compete with 500 words of vocabulary or a rolling session summary for
// the model's attention. See `learner_facts.mjs`.
function contextBlock({ targetLang, supportLang, profile, preferences, memory, learnerFacts }) {
  return [
    `TARGET LANGUAGE: ${targetLang}`,
    `SUPPORT LANGUAGE: ${supportLang}`,
    "",
    "=== LEARNER FACTS (persistent ground truth — take these as given, do not challenge or forget) ===",
    learnerFacts || "(no facts on file yet)",
    "",
    "=== LEARNER PROFILE (from app exercise data — ground truth) ===",
    profile || "(no profile data — treat as a brand-new learner)",
    "",
    "=== PREFERENCES ===",
    JSON.stringify(preferences || {}),
    "",
    "=== MEMORY (previous sessions, most recent first) ===",
    memory || "(empty — this is the first session)",
  ].join("\n");
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    sessionSummary: {
      type: "string",
      description: "2-3 sentences: what was practiced, how it went.",
    },
    wins: { type: "array", items: { type: "string" }, description: "Things the learner did well (max 3)." },
    struggles: {
      type: "array",
      items: { type: "string" },
      description: "Errors or gaps worth tracking, phrased concretely (max 3).",
    },
    newWords: {
      type: "array",
      description: "Target-language words introduced this session that are NOT part of the app's taught vocabulary. Dictionary/base form only.",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          translation: { type: "string" },
          note: { type: "string", description: "One short usage note, may be empty." },
          pos: {
            type: "string",
            enum: ["noun", "verb", "adjective", "other"],
            description: "Part of speech of the base form. Load-bearing: mastery-level caps are derived from it.",
          },
        },
        required: ["word", "translation", "note", "pos"],
        additionalProperties: false,
      },
    },
    nextFocus: { type: "string", description: "The single most useful focus for the next session, one line." },
    newLearnerFacts: {
      type: "array",
      description:
        "Durable identity/subject facts learned this session that the tutor must remember forever (not just next session). Examples: 'learner works as a maths teacher', 'partner is Ukrainian', 'main target language is Ukrainian', 'Pokémon is a video-game franchise, not real animals'. Each entry is a short self-contained sentence (max ~30 words). Do NOT include vocabulary here (those go in newWords). Do NOT include transient session state (that goes in sessionSummary). At most 5.",
      items: { type: "string" },
      maxItems: 5,
    },
    correctedLearnerFacts: {
      type: "array",
      description:
        "Corrections to previously-stored learner facts (from the LEARNER FACTS block in the system prompt). Each item names the existing fact being replaced and the new wording. Use this when the learner tells you a stored fact is wrong or has changed. At most 3.",
      items: {
        type: "object",
        properties: {
          replaces: { type: "string", description: "The existing fact text to replace, verbatim from the LEARNER FACTS block." },
          text: { type: "string", description: "The corrected fact wording." },
        },
        required: ["replaces", "text"],
        additionalProperties: false,
      },
      maxItems: 3,
    },
  },
  required: ["sessionSummary", "wins", "struggles", "newWords", "nextFocus", "newLearnerFacts", "correctedLearnerFacts"],
  additionalProperties: false,
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

    const body = JSON.parse(event.body || "{}");

    // Access probe for the app's start-screen button. Always 200 (a 403 here
    // would trip the e2e harness's failed-request detector), never calls the
    // model, and doesn't require the API key to be configured.
    if (body.mode === "ping") {
      const allowed = tutorEnabled(body.email) && (await hasAccess(body.email));
      return json(200, { allowed, vocabWriteback: allowed && writebackEnabled(body.email) });
    }

    // Append admissions to the public.vocab_admissions retention ledger.
    // Client fires this after applying admissions locally; the ledger is
    // analytics-only, so failures here never block learner state. Requires
    // the write-back cohort gate (not just tutor access) and the service
    // role key — no anon policies exist on the table by design.
    if (body.mode === "admissions") {
      if (!tutorEnabled(body.email) || !writebackEnabled(body.email)) {
        return json(403, { error: "Write-back is not enabled for this account." });
      }
      if (!(await hasAccess(body.email))) {
        return json(403, { error: "No access" });
      }
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        console.warn("vocab_admissions log skipped: SUPABASE_SERVICE_ROLE_KEY unset");
        return json(200, { ok: false, skipped: "service key unset" });
      }
      const rows = (Array.isArray(body.admissions) ? body.admissions : [])
        .slice(0, 20)
        .filter((a) => a && a.cid && a.word)
        .map((a) => ({
          user_email: String(body.email || "").toLowerCase().trim(),
          lang: String(body.lang || "").slice(0, 10),
          cid: String(a.cid).slice(0, 80),
          word: String(a.word).slice(0, 80),
          translation: String(a.translation || "").slice(0, 200),
          pos: String(a.pos || "noun").slice(0, 20),
          admitted_from: "tutor",
          sessions_seen: Number.isInteger(a.sessionsSeen) ? a.sessionsSeen : 3,
        }));
      if (!rows.length) return json(400, { error: "No admissions" });
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vocab_admissions`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        console.warn("vocab_admissions insert failed:", res.status, await res.text());
        return json(200, { ok: false });
      }
      return json(200, { ok: true, count: rows.length });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return json(503, { error: "Tutor not configured (missing API key)" });
    }

    const mode = body.mode === "summary" ? "summary" : "chat";

    if (!tutorEnabled(body.email)) {
      return json(403, { error: "The AI tutor is invite-only for now." });
    }
    if (!(await hasAccess(body.email))) {
      return json(403, { error: "No access" });
    }

    const targetLang = String(body.targetLang || "").slice(0, 40);
    const supportLang = String(body.supportLang || "").slice(0, 40);
    if (!targetLang || !supportLang) return json(400, { error: "Missing languages" });

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!rawMessages.length) return json(400, { error: "Missing messages" });
    if (rawMessages.length > MAX_MESSAGES) return json(400, { error: "Conversation too long" });

    const messages = rawMessages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, MAX_MESSAGE_CHARS),
    }));
    // The API requires the first message to be a user turn.
    if (messages[0].role !== "user") messages.unshift({ role: "user", content: "(session start)" });

    const system = [
      {
        type: "text",
        text: getInstructions(),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: contextBlock({
          targetLang,
          supportLang,
          profile: String(body.profile || "").slice(0, MAX_PROFILE_CHARS),
          preferences: body.preferences,
          memory: String(body.memory || "").slice(0, MAX_MEMORY_CHARS),
          learnerFacts: String(body.learnerFacts || "").slice(0, MAX_LEARNER_FACTS_CHARS),
        }),
        cache_control: { type: "ephemeral" },
      },
    ];

    const client = getClient();

    if (mode === "chat") {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages,
      });
      // Fire-and-forget; do NOT await — learner latency comes first. On
      // Netlify's invocation lifecycle the fetch usually completes before the
      // container freezes; if not, we lose one telemetry row, not the reply.
      logTutorSession({
        user_email: String(body.email || "").toLowerCase().trim(),
        mode: "chat",
        model: MODEL,
        tokens_in: response.usage?.input_tokens || 0,
        tokens_out: response.usage?.output_tokens || 0,
        cache_read_tokens: response.usage?.cache_read_input_tokens || 0,
        cache_write_tokens: response.usage?.cache_creation_input_tokens || 0,
        cost_est_cents: costCents(MODEL, response.usage),
        session_len_sec: null,
        subject: "chat",
        target_lang: targetLang,
        support_lang: supportLang,
        turn_index: Math.floor(messages.length / 2), // rough: user+assistant pairs so far
      });
      if (response.stop_reason === "refusal") {
        console.warn("TUTOR REFUSAL:", JSON.stringify(response.stop_details || null));
        return json(200, { reply: null, refused: true });
      }
      const reply = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!reply) {
        // Diagnosable in the Netlify function logs if it ever recurs.
        console.warn(
          "TUTOR EMPTY REPLY:",
          response.stop_reason,
          response.content.map((b) => b.type).join(",")
        );
      }
      return json(200, { reply });
    }

    // Summary mode: ask for the structured end-of-session record.
    messages.push({
      role: "user",
      content:
        "(The session is over. Produce the end-of-session record as JSON. " +
        "Only include in newWords the target-language words you introduced that are outside the app's taught vocabulary in the profile.)",
    });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
    });
    logTutorSession({
      user_email: String(body.email || "").toLowerCase().trim(),
      mode: "summary",
      model: MODEL,
      tokens_in: response.usage?.input_tokens || 0,
      tokens_out: response.usage?.output_tokens || 0,
      cache_read_tokens: response.usage?.cache_read_input_tokens || 0,
      cache_write_tokens: response.usage?.cache_creation_input_tokens || 0,
      cost_est_cents: costCents(MODEL, response.usage),
      // Wall-clock session length isn't computable inside a single function
      // invocation; plumb a client-side session_start_ts later if Dan wants it.
      session_len_sec: null,
      subject: "summary",
      target_lang: targetLang,
      support_lang: supportLang,
      turn_index: null,
    });
    if (response.stop_reason === "refusal") {
      return json(200, { summary: null, refused: true });
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return json(200, { summary: JSON.parse(text) });
  } catch (err) {
    console.error("TUTOR ERROR:", err);
    return json(500, { error: "Tutor request failed" });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj),
  };
}
