// Launch-spike observability beacon.
// Accepts { type, payload } posts from the app, logs one structured JSON line
// to the Netlify function log, persists to the Supabase `events` table, and
// optionally forwards a one-line summary to a Slack webhook if
// BEACON_SLACK_WEBHOOK is set in the Netlify environment.
//
// Types currently emitted by the client:
//   - "error"            : window error / unhandledrejection
//   - "cta_click"        : click on a stan.store link
//   - "session_start"    : app loaded with an email present
//   - "session_complete" : a learning session finished
//
// View events: `netlify functions:log beacon --live` (or Netlify UI → Logs),
// or query the Supabase `events` table directly.

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: "" };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || "{}");
  } catch (_) {
    return { statusCode: 400, headers: cors(), body: "" };
  }

  const type = typeof parsed.type === "string" ? parsed.type.slice(0, 32) : "unknown";
  const payload = parsed.payload && typeof parsed.payload === "object" ? parsed.payload : {};
  const ua = (event.headers["user-agent"] || "").slice(0, 256);
  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "";
  const at = new Date().toISOString();
  const email = typeof payload.email === "string" ? payload.email.toLowerCase().trim() : null;

  const record = { at, type, payload, ua, ip };
  console.log("BEACON " + JSON.stringify(record));

  // Persist to Supabase. Prefer service role key (set SUPABASE_SERVICE_KEY in
  // Netlify env) so RLS doesn't need an anon-insert policy; fall back to anon.
  const writeKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST",
      headers: {
        "apikey": writeKey,
        "Authorization": `Bearer ${writeKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ at, type, email: email || null, payload, ua, ip })
    });
    if (!res.ok) {
      console.error("BEACON supabase insert failed:", res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.error("BEACON supabase insert error:", err && err.message);
  }

  const webhook = process.env.BEACON_SLACK_WEBHOOK;
  if (webhook && typeof fetch === "function") {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackText(type, payload, ua) })
      });
    } catch (err) {
      console.error("BEACON slack forward failed:", err && err.message);
    }
  }

  return { statusCode: 204, headers: cors(), body: "" };
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function slackText(type, payload, ua) {
  const short = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
  if (type === "error") {
    return (
      "error · " +
      short(payload.message, 160) +
      " · " +
      short(payload.source, 80) +
      ":" +
      (payload.line ?? "?") +
      ":" +
      (payload.col ?? "?") +
      " · path=" +
      short(payload.path, 80) +
      " · ua=" +
      short(ua, 80)
    );
  }
  if (type === "cta_click") {
    return (
      "cta_click · " +
      short(payload.offer || "other", 16) +
      " · " +
      short(payload.email, 120) +
      " · surface=" +
      short(payload.surface, 40) +
      " · concept=" +
      short(payload.concept, 80) +
      "@L" +
      (payload.conceptLevel ?? "?") +
      " · session#" +
      (payload.sessionNumber ?? "?") +
      ":" +
      (payload.sessionExerciseCount ?? "?") +
      " · released=" +
      (payload.releasedCount ?? "?") +
      " (done=" +
      (payload.completedCount ?? "?") +
      ") · lang=" +
      short(payload.supportLang, 8) +
      "/" +
      short(payload.targetLang, 8) +
      " · " +
      short(payload.href, 160)
    );
  }
  if (type === "session_complete") {
    return (
      "session_complete · " +
      short(payload.email, 120) +
      " · #" +
      (payload.sessionNumber ?? "?") +
      " · lang=" +
      short(payload.supportLang, 8) +
      "/" +
      short(payload.targetLang, 8) +
      (payload.milestone ? " · milestone=" + short(String(payload.milestone), 40) : "")
    );
  }
  if (type === "session_start") {
    return (
      "session_start · " +
      short(payload.email, 120) +
      " · #" +
      (payload.sessionNumber ?? "?") +
      " · lang=" +
      short(payload.supportLang, 8) +
      "/" +
      short(payload.targetLang, 8)
    );
  }
  return type + " · " + short(JSON.stringify(payload), 300);
}
