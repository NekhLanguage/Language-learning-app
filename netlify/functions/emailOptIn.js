// The weekly-email question a free-tier learner answers in the app
// (Austin via Nekh 2026-10-04). POST { optIn: true|false } with the
// learner's session token.
//
// Shown once, to a learner whose row was created without an answer (a
// first Google sign-in — the sign-up form asks before the account exists
// and authProvision stores that answer instead). The answer stamps
// `email_opt_in_asked_at`, and `email_opt_in_at` when ticked; only then
// is the address handed to MailerLite (app-trial). An unticked answer
// never touches MailerLite. Returns { ok, optedIn, emailOptInAsked: true }.

const { usersKey, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow } = require("./auth");
const { recordEmailOptIn } = require("./entitlement");

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
    const key = usersKey();
    if (!key) return missingKeyResponse();
    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const body = JSON.parse(event.body || "{}");
    const optIn = body.optIn === true;
    const row = await fetchAccessRow(session.email, key);
    if (!row) return json(404, { error: "No account row", code: "no_row" });
    const result = await recordEmailOptIn(session.email, optIn);
    console.log("emailOptIn:", optIn ? "opted in" : "declined", result.recorded ? "(recorded)" : "(already answered)");
    return json(200, {
      ok: true,
      optedIn: !!(row.email_opt_in_at || (optIn && result.recorded)),
      emailOptInAsked: true,
    });
  } catch (err) {
    console.error("emailOptIn error:", err);
    return json(500, { error: "Server error" });
  }
};
