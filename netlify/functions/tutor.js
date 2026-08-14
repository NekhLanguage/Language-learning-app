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

// Request caps — a test feature shouldn't be an open token faucet.
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 2000;
const MAX_PROFILE_CHARS = 20000;
const MAX_MEMORY_CHARS = 8000;

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
function contextBlock({ targetLang, supportLang, profile, preferences, memory }) {
  return [
    `TARGET LANGUAGE: ${targetLang}`,
    `SUPPORT LANGUAGE: ${supportLang}`,
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
        },
        required: ["word", "translation", "note"],
        additionalProperties: false,
      },
    },
    nextFocus: { type: "string", description: "The single most useful focus for the next session, one line." },
  },
  required: ["sessionSummary", "wins", "struggles", "newWords", "nextFocus"],
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
      return json(200, { allowed });
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
