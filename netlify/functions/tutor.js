// AI Tutor Netlify Function.
// Proxies tutor conversations to the Claude API so the API key never reaches
// the browser. Two modes:
//   POST {mode:"chat", email, targetLang, supportLang, profile, preferences,
//         memory, messages:[{role,content}...]}
//     -> {reply}
//   POST {mode:"summary", ...same fields}
//     -> {summary:{sessionSummary, wins, struggles, newWords, recycledWords, nextFocus}}
// The summary powers the app-side session memory and personal-vocabulary
// tracking; structured outputs guarantee it parses.
//
// Beta features (BETA_EMAILS, see betaFeatures) add fields on top: chat and
// summary take `topics` (the learner's conversation topics, rendered by
// tutor_topics.mjs) and the summary then also files the session under a
// topic and may propose new ones.
//
// Identity comes from the Supabase session token (Authorization: Bearer),
// never from the body; Anna additionally needs an active subscription
// (users.access_until). TUTOR_ALLOWED_EMAILS is an optional test-time
// restriction, off by default.
// Requires ANTHROPIC_API_KEY in the function environment; TUTOR_MODEL
// optionally overrides the model (TUTOR_SUMMARY_MODEL: the summary call only).

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const { SUPABASE_URL, publishableKey, secretKey, restHeaders } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow, subscriptionActive } = require("./auth");

const MODEL = process.env.TUTOR_MODEL || "claude-sonnet-5";
// The end-of-session record is a structured-output call with a 2048-token
// budget on top of the full transcript, so it is the slowest request the
// tutor makes. TUTOR_SUMMARY_MODEL lets it run on a faster model than the
// conversation without touching chat quality.
const SUMMARY_MODEL = process.env.TUTOR_SUMMARY_MODEL || MODEL;

// --- Cost telemetry (public.tutor_sessions) -------------------------------
// One row per messages.create() call so per-user variable cost is measurable
// against the subscription floor. Fire-and-forget: a Supabase hiccup must
// never slow or break the learner's chat.

// Per-1M-token prices in US cents. UPDATE ON ANY MODEL SWAP or Anthropic
// price change. Verified against the published price list on 2026-09-17:
// claude-sonnet-5's $2/$10 launch price was made permanent (the $3/$15
// increase scheduled for 2026-09-01 did not happen). Cache read = 0.1x
// input, cache write (5 min) = 1.25x input; Fable 5.1 reads at 0.025x.
// These rows feed the per-user cost distribution (tutor_cost_percentiles
// in Supabase) that decides Anna's pricing floor, so keep them exact.
const MODEL_PRICES_CENTS_PER_MTOK = {
  "claude-sonnet-5":           { input: 200,  output: 1000, cache_read: 20,  cache_write: 250  },
  "claude-opus-5":             { input: 500,  output: 2500, cache_read: 50,  cache_write: 625  },
  "claude-haiku-4-5-20251001": { input: 100,  output: 500,  cache_read: 10,  cache_write: 125  },
  "claude-haiku-4-5":          { input: 100,  output: 500,  cache_read: 10,  cache_write: 125  },
  "claude-fable-5":            { input: 1000, output: 5000, cache_read: 100, cache_write: 1250 },
  "claude-fable-5-1":          { input: 1000, output: 5000, cache_read: 25,  cache_write: 1250 },
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
  // tutor_sessions has no anon policy: needs the sb_secret_ key.
  const key = secretKey();
  if (!key) {
    console.warn("tutor_sessions log skipped: SUPABASE_SECRET_KEY unset");
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tutor_sessions`, {
      method: "POST",
      headers: restHeaders(key, {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
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
// The learner's free-text instructions for Anna (tutor.html settings panel;
// the client caps at the same length).
const MAX_NOTE_CHARS = 1000;
// The conversation-topics block (beta). Client-rendered; bounded there too.
const MAX_TOPICS_CHARS = 6000;

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

// Anna is open to every learner with an active subscription window (see
// hasAccess). TUTOR_ALLOWED_EMAILS (Netlify env var) is an optional
// comma-separated restriction for testing: unset, empty or "*" means no
// restriction (Nekh 2026-09-16: a permanent setup with no upkeep — until
// then an unset list meant NOBODY, which is how Emi and Brody ended up
// locked out). A list of emails limits Anna to those learners.
function tutorEnabled(email) {
  const normalized = String(email || "").toLowerCase().trim();
  const allowlist = (process.env.TUTOR_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  if (!allowlist.length) return true;
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

// Beta testers (BETA_EMAILS, Netlify env var): a comma-separated list of
// learners who get every feature still in beta. Unset or empty means
// NOBODY — a beta feature ships dark. "*" opens beta to every tutor user;
// adding a tester needs no deploy. One list for all beta features, so a
// new feature is one more key here, not one more env var. The client
// reads the result via ping and the server re-checks it on every request
// that uses a beta field, so the flag is never just a hidden button.
const BETA_FEATURE_KEYS = ["topics"];

function betaTester(email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized) return false;
  const allowlist = (process.env.BETA_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  if (!allowlist.length) return false;
  if (allowlist.includes("*")) return true;
  return allowlist.includes(normalized);
}

function betaFeatures(email) {
  const on = betaTester(email);
  return Object.fromEntries(BETA_FEATURE_KEYS.map((k) => [k, on]));
}

// Anna needs an active subscription (users.access_until — see
// migrations/users_access_until.sql), not just a `users` row: a learner
// whose window has lapsed keeps the app and sees Anna greyed out.
async function hasAccess(email) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized) return false;
  const key = publishableKey();
  if (!key) {
    console.error("tutor: SUPABASE_PUBLISHABLE_KEY unset — treating every account as no-access");
    return false;
  }
  let row;
  try {
    row = await fetchAccessRow(normalized, key);
  } catch (err) {
    console.error("Supabase error:", err);
    return false;
  }
  return !!row && subscriptionActive(row.access_until);
}

// The per-learner context block. Rendered after the (cached) instructions so
// the instructions prefix stays byte-identical across all learners.
//
// Order is load-bearing: LEARNER FACTS come first, verbatim, so identity /
// subject ground truth ("learner is Norwegian teaching in Norway",
// "Pokémon is a video-game franchise, not real animals") never has to
// compete with 500 words of vocabulary or a rolling session summary for
// the model's attention. See `learner_facts.mjs`.
//
// PREFERENCES and the learner's own INSTRUCTIONS come right after the facts
// and BEFORE the profile: they used to trail a 20k-character vocabulary
// dump as one line of raw JSON, and Anna treated them as background noise.
// Rendered as explicit rules, in prose, and repeated per turn (see
// `steeringTrailer`) so they hold across a long conversation.
function contextBlock({ targetLang, supportLang, profile, preferences, memory, learnerFacts, topics, today }) {
  const lines = [
    // Today's date, so the dated memory entries mean something: Anna can
    // tell a five-day gap from yesterday and not quiz the learner on
    // details they have since forgotten (Nekh 2026-09-24).
    `TODAY: ${today || new Date().toISOString().slice(0, 10)}`,
    `TARGET LANGUAGE: ${targetLang}`,
    `SUPPORT LANGUAGE: ${supportLang}`,
    "",
    "=== LEARNER FACTS (persistent ground truth — take these as given, do not challenge or forget) ===",
    learnerFacts || "(no facts on file yet)",
    "",
    renderPreferences(preferences),
    "",
    "=== LEARNER PROFILE (from app exercise data — ground truth) ===",
    profile || "(no profile data — treat as a brand-new learner)",
    "",
    "=== MEMORY (previous sessions, most recent first) ===",
    memory || "(empty — this is the first session)",
  ];
  if (topics) lines.push("", renderTopicsBlock(topics));
  return lines.join("\n");
}

// Conversation topics (beta). Only rendered for beta testers, so every
// other learner's prompt is byte-identical to before the feature.
function renderTopicsBlock(topics) {
  return [
    "=== CONVERSATION TOPICS (the learner groups conversations into topics) ===",
    topics,
    "",
    "How to use topics:",
    "- With an active topic, this conversation continues it: use your notes and the recent sessions to pick up where you left off (what was read or watched, opinions given, what you promised to come back to) and keep the conversation on that subject unless the learner steers away.",
    "- With no active topic, talk about whatever the learner brings; the session is filed at the end.",
    "- You may ask the learner ONE short question about organising topics when it genuinely helps — e.g. the conversation has moved to a subject that deserves its own topic, or several topics share a broader theme (several specific manga -> \"Books and reading\"). Ask at a natural pause, in the support language, at most once per session, and never interrupt a correction to do it.",
    "- You cannot create, rename or move topics mid-conversation. Never claim you have. Changes happen through the end-of-session record, and a new broader topic is only created once the learner says yes.",
  ].join("\n");
}

// The three coaching dials, spelled out as the concrete behaviour each
// value demands (the instructions file defines them too; restating the
// chosen value here means the model never has to look it up).
const DIAL_TEXT = {
  correctionDepth: {
    light: "recast the learner's sentence correctly inside your natural reply and move on — no meta-commentary",
    medium: "one brief inline note per mistake — what was wrong and the fix, one line — then continue the conversation",
    deep: "for every mistake name the rule, why it was wrong, the correct pattern and one related example, then return to the conversation",
  },
  challenge: {
    comfort: "stay well inside known vocabulary, shorter sentences, yes/no and either/or questions welcome, generous encouragement",
    stretch: "i+1 — mostly open questions, one small step beyond what the learner just showed",
    push: "longer sentences, open-ended questions only, new words at the top of the allowed range, ask for opinions and reasons, do not simplify at the first sign of struggle",
  },
  languageMix: {
    immersion: "target language only, corrections and explanations included; switch to the support language only if the learner explicitly asks or is clearly lost after two attempts",
    balanced: "scales with the learner's tier — beginners get up to half of each message in the support language with glosses; stronger learners get target-language conversation with support-language corrections only",
    support: "converse in the target language but explain freely in the support language",
  },
};

function normalizePrefs(preferences) {
  const p = preferences && typeof preferences === "object" ? preferences : {};
  const pick = (key, dflt) => (DIAL_TEXT[key][p[key]] ? p[key] : dflt);
  return {
    correctionDepth: pick("correctionDepth", "medium"),
    challenge: pick("challenge", "stretch"),
    languageMix: pick("languageMix", "balanced"),
    note: String(p.note || "").trim().slice(0, MAX_NOTE_CHARS),
  };
}

function renderPreferences(preferences) {
  const p = normalizePrefs(preferences);
  const lines = [
    "=== PREFERENCES (the learner chose these — binding for every reply, not suggestions) ===",
    `- Corrections: ${p.correctionDepth} — ${DIAL_TEXT.correctionDepth[p.correctionDepth]}.`,
    `- Challenge: ${p.challenge} — ${DIAL_TEXT.challenge[p.challenge]}.`,
    `- Language mix: ${p.languageMix} — ${DIAL_TEXT.languageMix[p.languageMix]}.`,
    "",
    "=== LEARNER'S OWN INSTRUCTIONS (written by the learner for you; follow them in every reply — they outrank the dials above and your default habits, but never the vocabulary contract or the honesty rules) ===",
  ];
  if (p.note) {
    lines.push('"""', p.note, '"""');
  } else {
    lines.push("(none given)");
  }
  return lines.join("\n");
}

// Appended by the server to the learner's latest chat message. Instructions
// that live only in the system prompt fade over a long conversation; a
// short per-turn restatement next to the text being answered keeps them
// live. The client never sees or stores this text.
function steeringTrailer(preferences) {
  const p = normalizePrefs(preferences);
  const parts = [
    `corrections=${p.correctionDepth}`,
    `challenge=${p.challenge}`,
    `language mix=${p.languageMix}`,
  ];
  let text =
    "\n\n[App reminder — not written by the learner; never quote, mention or acknowledge it. " +
    `Reply within the learner's settings: ${parts.join(", ")}.`;
  if (p.note) text += ` The learner's own instructions to you: "${p.note}"`;
  return text + "]";
}

// This schema is sent raw to the structured-outputs API, which supports only
// a subset of JSON Schema: array/string constraints (maxItems, minItems,
// minLength, maxLength, pattern, minimum, maximum...) are rejected with a 400,
// which surfaces to the learner as "Couldn't save the session". Express size
// limits in the field descriptions instead, and enforce hard caps client-side
// (see learner_facts.mjs / tutor_admission.mjs). tests/unit/tutor_schema.test.mjs
// lints the schema for unsupported keywords.
const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    sessionSummary: {
      type: "string",
      description: "2-3 sentences: what was practiced, how it went. Begin with the opener you used, e.g. 'Opened by asking about X — learner answered / did not remember / changed subject.' An opener recorded here is used up: it must not be repeated in a later session.",
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
          exampleSentence: {
            type: "string",
            description: "One short natural target-language sentence using this word — the actual sentence you used in conversation this session when possible, otherwise a fresh one at the learner's level. Empty string only if you truly cannot produce one.",
          },
          exampleTranslation: {
            type: "string",
            description: "Support-language translation of exampleSentence. Empty string if exampleSentence is empty.",
          },
        },
        required: ["word", "translation", "note", "pos", "exampleSentence", "exampleTranslation"],
        additionalProperties: false,
      },
    },
    recycledWords: {
      type: "array",
      description:
        "Words from the PERSONAL VOCABULARY block that you actually used in this session's conversation, in any inflected form. Write each in its dictionary form exactly as it appears in that block. Only words you used — an empty array if none. This is how the app counts repeat exposure toward adding the word to the learner's vocabulary, so be accurate in both directions.",
      items: { type: "string" },
    },
    nextFocus: {
      type: "string",
      description: "The single most useful SKILL to work on next session, one line (a grammar point, a word family, a conversational move). Never a specific question to ask or a plot/content detail to revisit — those belong in sessionSummary. If this session's next focus was not taken up by the learner, choose a different one rather than carrying it over.",
    },
    newLearnerFacts: {
      type: "array",
      description:
        "Durable identity/subject facts learned this session that the tutor must remember forever (not just next session). Examples: 'learner works as a maths teacher', 'partner is Ukrainian', 'main target language is Ukrainian', 'Pokémon is a video-game franchise, not real animals'. Each entry is a short self-contained sentence (max ~30 words). Do NOT include vocabulary here (those go in newWords). Do NOT include transient session state (that goes in sessionSummary). At most 5.",
      items: { type: "string" },
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
    },
  },
  required: ["sessionSummary", "wins", "struggles", "newWords", "recycledWords", "nextFocus", "newLearnerFacts", "correctedLearnerFacts"],
  additionalProperties: false,
};

// Summary schema for beta testers with topics on: the base record plus
// where to file the session and any broader topics to propose. Same
// structured-outputs subset rules as SUMMARY_SCHEMA.
const TOPIC_SUMMARY_FIELDS = {
  topic: {
    type: "object",
    description: "Where this session is filed in the learner's CONVERSATION TOPICS.",
    properties: {
      assignedTopicId: {
        type: "string",
        description: "The id (from ALL TOPICS) of the topic this conversation was about. Normally the ACTIVE TOPIC; a different existing id only if the conversation clearly moved to that subject. Empty string if no existing topic fits.",
      },
      newTopicName: {
        type: "string",
        description: "Only when assignedTopicId is empty AND the conversation had one clear subject worth returning to: a short name for a new topic (1-4 words, e.g. \"One Piece\", \"Cooking\"). Otherwise empty string. Small talk is not a topic.",
      },
      topicNotes: {
        type: "string",
        description: "Your updated running notes for the assigned or new topic, replacing the old notes: keep what still matters from the old notes and add what was learned this session (titles, chapters, characters, the learner's opinions, what to come back to). Plain prose, max ~150 words. Empty string if the session is not filed under a topic.",
      },
    },
    required: ["assignedTopicId", "newTopicName", "topicNotes"],
    additionalProperties: false,
  },
  proposedTopics: {
    type: "array",
    description: "New topics to ask the learner about — usually a broader topic grouping several existing ones (e.g. \"Books and reading\" over two specific manga), or a subject that came up but deserves its own topic. The app asks the learner each question; nothing is created unless they say yes. Empty array when nothing is worth proposing — most sessions. At most 2.",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short topic name, 1-4 words." },
        question: { type: "string", description: "The yes/no question the app shows the learner, in the support language, one sentence." },
        groupsTopicIds: {
          type: "array",
          items: { type: "string" },
          description: "Ids of existing topics that would sit under this new one. Empty array if none.",
        },
      },
      required: ["name", "question", "groupsTopicIds"],
      additionalProperties: false,
    },
  },
};

const SUMMARY_SCHEMA_WITH_TOPICS = {
  ...SUMMARY_SCHEMA,
  properties: { ...SUMMARY_SCHEMA.properties, ...TOPIC_SUMMARY_FIELDS },
  required: [...SUMMARY_SCHEMA.required, "topic", "proposedTopics"],
};

// Everything a model call needs, or the error to send instead. Shared by
// the classic handler below and the streaming function (tutorStream.mjs).
// `body.email` must already be the verified session identity.
async function buildConversation(body, mode) {
  const fail = (status, error) => ({ error: { status, body: { error } } });
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "Tutor not configured (missing API key)");
  if (!tutorEnabled(body.email)) return fail(403, "The AI tutor is invite-only for now.");
  if (!(await hasAccess(body.email))) return fail(403, "Anna needs an active subscription.");

  const targetLang = String(body.targetLang || "").slice(0, 40);
  const supportLang = String(body.supportLang || "").slice(0, 40);
  if (!targetLang || !supportLang) return fail(400, "Missing languages");

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  if (!rawMessages.length) return fail(400, "Missing messages");
  if (rawMessages.length > MAX_MESSAGES) return fail(400, "Conversation too long");

  const messages = rawMessages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, MAX_MESSAGE_CHARS),
  }));
  // The API requires the first message to be a user turn.
  if (messages[0].role !== "user") messages.unshift({ role: "user", content: "(session start)" });
  // Per-turn steering (chat only — the summary has its own closing turn).
  if (mode === "chat") {
    const last = messages[messages.length - 1];
    if (last.role === "user") last.content += steeringTrailer(body.preferences);
  }
  // Cache the conversation history too. The system blocks below are
  // cached, but without a breakpoint in `messages` every turn re-bills the
  // whole transcript at full input price. The marker goes on the LAST
  // ASSISTANT turn, not the last user turn: the steering trailer above is
  // appended server-side and never stored by the client, so the latest
  // user message is resent without it next turn — a marker there would
  // miss every time. Everything up to the last assistant turn is
  // byte-identical across turns (and between the chat and the summary
  // call), so it reads from cache at a tenth of the price.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    messages[i] = {
      role: "assistant",
      content: [{ type: "text", text: messages[i].content, cache_control: { type: "ephemeral" } }],
    };
    break;
  }

  // Beta fields are honoured only for beta testers — a client that sends
  // them anyway gets the standard prompt and schema.
  const topics = betaFeatures(body.email).topics && typeof body.topics === "string"
    ? body.topics.trim().slice(0, MAX_TOPICS_CHARS)
    : "";

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
        topics,
      }),
      cache_control: { type: "ephemeral" },
    },
  ];
  return { system, messages, targetLang, supportLang, topicsOn: !!topics };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };

    const body = JSON.parse(event.body || "{}");

    // Who is asking: the verified Supabase session (Authorization header).
    // The body's `email` field is never trusted. The identity is stamped
    // onto `body.email` so the rest of the handler keeps reading one place.
    const session = await verifySession(event);
    body.email = session ? session.email : "";

    // Access probe for the app's start-screen button. Always 200 (a 403 or
    // 401 here would trip the e2e harness's failed-request detector), never
    // calls the model, and doesn't require the API key to be configured.
    if (body.mode === "ping") {
      if (!session) return json(200, { allowed: false, vocabWriteback: false, beta: {}, reason: "unauthenticated" });
      const allowed = tutorEnabled(body.email) && (await hasAccess(body.email));
      const beta = betaFeatures(body.email);
      if (!allowed) for (const k of Object.keys(beta)) beta[k] = false;
      return json(200, { allowed, vocabWriteback: allowed && writebackEnabled(body.email), beta });
    }

    if (!session) return unauthorizedResponse();

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
      const serviceKey = secretKey();
      if (!serviceKey) {
        console.warn("vocab_admissions log skipped: SUPABASE_SECRET_KEY unset");
        return json(200, { ok: false, skipped: "secret key unset" });
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
        headers: restHeaders(serviceKey, {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        console.warn("vocab_admissions insert failed:", res.status, await res.text());
        return json(200, { ok: false });
      }
      return json(200, { ok: true, count: rows.length });
    }

    const mode = body.mode === "summary" ? "summary" : "chat";
    const built = await buildConversation(body, mode);
    if (built.error) return json(built.error.status, built.error.body);
    const { system, messages, targetLang, supportLang, topicsOn } = built;

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
        "Only include in newWords the target-language words you introduced that are outside the app's taught vocabulary in the profile." +
        (topicsOn ? " File the session under the learner's CONVERSATION TOPICS and propose new topics only if genuinely useful." : "") +
        ")",
    });
    // No thinking pass on the record: it is extraction from a transcript
    // the model already has, and the pass was most of the 20-40 s the
    // learner used to wait at End session (Nekh 2026-09-21). Sonnet 5
    // accepts an explicit disabled here; the JSON schema still constrains
    // the output.
    const response = await client.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 2048,
      thinking: { type: "disabled" },
      system,
      messages,
      output_config: { format: { type: "json_schema", schema: topicsOn ? SUMMARY_SCHEMA_WITH_TOPICS : SUMMARY_SCHEMA } },
    });
    logTutorSession({
      user_email: String(body.email || "").toLowerCase().trim(),
      mode: "summary",
      model: SUMMARY_MODEL,
      tokens_in: response.usage?.input_tokens || 0,
      tokens_out: response.usage?.output_tokens || 0,
      cache_read_tokens: response.usage?.cache_read_input_tokens || 0,
      cache_write_tokens: response.usage?.cache_creation_input_tokens || 0,
      cost_est_cents: costCents(SUMMARY_MODEL, response.usage),
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
    if (response.stop_reason === "max_tokens") {
      // The JSON is cut off mid-document; parsing it would throw and turn a
      // known condition into an opaque 500.
      console.warn("TUTOR SUMMARY TRUNCATED at", response.usage?.output_tokens, "output tokens");
      return json(200, { summary: null, truncated: true });
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

// For tests only (tests/unit/tutor_schema.test.mjs, tutor_prefs.test.mjs).
exports.SUMMARY_SCHEMA = SUMMARY_SCHEMA;
exports.SUMMARY_SCHEMA_WITH_TOPICS = SUMMARY_SCHEMA_WITH_TOPICS;
// For tutorStream.mjs (the streaming chat path shares every gate and prompt).
exports.buildConversation = buildConversation;
exports.getClient = getClient;
exports.logTutorSession = logTutorSession;
exports.costCents = costCents;
exports.MODEL = MODEL;
exports.contextBlock = contextBlock;
exports.renderPreferences = renderPreferences;
exports.steeringTrailer = steeringTrailer;
exports.tutorEnabled = tutorEnabled;
exports.betaFeatures = betaFeatures;
