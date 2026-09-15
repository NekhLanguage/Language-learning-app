// Shared Supabase connection for every Netlify function.
//
// No key lives in this repository. The functions read
//   SUPABASE_PUBLISHABLE_KEY  (sb_publishable_…, Netlify env) — the
//     RLS-scoped key every learner-facing call uses (users, events).
//   SUPABASE_SECRET_KEY       (sb_secret_…, Netlify env, optional) — the
//     RLS-bypassing key for the three admin/telemetry paths that write or
//     read tables with no anon policy (tutor_sessions, vocab_admissions,
//     the getEvents admin read). Unset means those paths skip or 503;
//     they never fall back to the publishable key.
// Legacy JWT keys (anon / service_role) are not read anywhere, so Supabase
// can disable them without touching this code (Nekh 2026-09-15).

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";

function readEnv(name) {
  const value = (process.env[name] || "").trim();
  return value || null;
}

function publishableKey() {
  return readEnv("SUPABASE_PUBLISHABLE_KEY");
}

function secretKey() {
  return readEnv("SUPABASE_SECRET_KEY");
}

// PostgREST headers for a key. Never log the returned object.
function restHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// The response a function returns when the publishable key is missing:
// a loud 503, never a silent fallback to a literal.
function missingKeyResponse(extraBody = {}) {
  console.error("SUPABASE_PUBLISHABLE_KEY is not set in the function environment");
  return {
    statusCode: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ error: "Supabase not configured (SUPABASE_PUBLISHABLE_KEY unset)", ...extraBody }),
  };
}

module.exports = { SUPABASE_URL, publishableKey, secretKey, restHeaders, missingKeyResponse };
