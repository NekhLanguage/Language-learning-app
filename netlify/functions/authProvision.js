// First-time password setup for a learner who bought access before the app
// had accounts (or who was granted access by hand). POST { email }.
//
// If the email has a `users` row, make sure a Supabase Auth account exists
// for it so the "Set or reset your password" email that the browser
// requests next actually has somewhere to land. The response is the same
// whether or not the email is known — this endpoint must not tell a
// stranger which addresses have access.

const { publishableKey, missingKeyResponse } = require("./supabase");
const { fetchAccessRow, ensureAuthUser } = require("./auth");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const { email } = JSON.parse(event.body || "{}");
    const normalized = String(email || "").toLowerCase().trim();
    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      return json(400, { error: "Missing email" });
    }
    const key = publishableKey();
    if (!key) return missingKeyResponse();

    const row = await fetchAccessRow(normalized, key);
    if (row) {
      const outcome = await ensureAuthUser(normalized);
      if (outcome === "skipped") {
        console.error("authProvision: SUPABASE_SECRET_KEY unset — cannot create auth accounts");
        return json(503, { error: "Account setup is not configured on the server" });
      }
      console.log("authProvision:", outcome);
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("authProvision error:", err);
    return json(500, { error: "Server error" });
  }
};
