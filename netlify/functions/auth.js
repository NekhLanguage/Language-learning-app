// Supabase Auth helpers shared by the learner-facing functions.
//
// Since the authentication cutover (Nekh 2026-09-15) a function never trusts
// an email in the request body: the browser sends the learner's Supabase
// session token as `Authorization: Bearer <jwt>` and the function asks
// Supabase Auth who that token belongs to. A missing or stale token means
// 401 — the caller has to sign in again.

const { SUPABASE_URL, publishableKey, secretKey, restHeaders } = require("./supabase");

// The bearer token from the request headers (Netlify lowercases header
// names, but be tolerant), or null.
function bearerToken(event) {
  const headers = (event && event.headers) || {};
  const raw = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1].trim() : null;
}

// Resolve the caller's verified identity: `{ email, id }` for a live session,
// `null` when the request carries no token or Supabase rejects it. Throws
// only when Supabase itself is unreachable or unconfigured, so callers can
// tell "sign in again" (null) from "server trouble" (throw).
async function verifySession(event) {
  const token = bearerToken(event);
  if (!token) return null;
  const key = publishableKey();
  if (!key) throw new Error("SUPABASE_PUBLISHABLE_KEY unset");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Supabase auth/v1/user returned ${res.status}`);
  const user = await res.json();
  const email = String((user && user.email) || "").toLowerCase().trim();
  if (!email) return null;
  return { email, id: user.id || null };
}

function unauthorizedResponse(extraBody = {}) {
  return {
    statusCode: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ error: "Sign in required", code: "unauthenticated", ...extraBody }),
  };
}

// True when `access_until` (a public.users column) marks a live
// subscription: 'infinity' is permanent, NULL is none, a timestamp counts
// while it is in the future.
function subscriptionActive(accessUntil, now = Date.now()) {
  if (accessUntil === null || accessUntil === undefined || accessUntil === "") return false;
  if (accessUntil === "infinity") return true;
  const t = Date.parse(accessUntil);
  return Number.isFinite(t) && t > now;
}

// The learner's `users` row (email + access_until) or null when the email
// has no row, read with the publishable key. Throws on a Supabase error.
async function fetchAccessRow(email, key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=email,access_until`,
    { headers: restHeaders(key) }
  );
  if (!res.ok) throw new Error(`users lookup returned ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Make sure a Supabase Auth account exists for an email (secret key, admin
// API). Idempotent: an already-registered email is not an error. Returns
// "created", "exists" or "skipped" (secret key unset).
async function ensureAuthUser(email) {
  const key = secretKey();
  if (!key) return "skipped";
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (res.ok) return "created";
  const text = await res.text();
  if (res.status === 422 && /already|exists/i.test(text)) return "exists";
  throw new Error(`auth admin createUser returned ${res.status}: ${text}`);
}

module.exports = {
  bearerToken,
  verifySession,
  unauthorizedResponse,
  subscriptionActive,
  fetchAccessRow,
  ensureAuthUser,
};
