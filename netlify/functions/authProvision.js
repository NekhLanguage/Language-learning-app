// Account creation and first-time password setup. POST { email }.
//
// Free tier (Nekh 2026-09-30): the gate to lessons 1-3 is an account with
// an email, nothing more. This makes sure a Supabase Auth account exists
// for the address so the "set your password" email the browser requests
// next has somewhere to land. Owning the inbox is the proof: the free-tier
// `users` row is created only when that account first signs in
// (checkAccess), never here, so typing a stranger's address subscribes
// them to nothing. The response is the same for every address — this
// endpoint must not tell a stranger which addresses have access.

const { ensureAuthUser } = require("./auth");

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
    const outcome = await ensureAuthUser(normalized);
    if (outcome === "skipped") {
      console.error("authProvision: SUPABASE_SECRET_KEY unset — cannot create auth accounts");
      return json(503, { error: "Account setup is not configured on the server" });
    }
    console.log("authProvision:", outcome);
    return json(200, { ok: true });
  } catch (err) {
    console.error("authProvision error:", err);
    return json(500, { error: "Server error" });
  }
};
