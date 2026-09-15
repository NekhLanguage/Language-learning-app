const { publishableKey, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow, subscriptionActive } = require("./auth");

// Who may use the app: the signed-in learner (Supabase Auth session token in
// the Authorization header — the request body is ignored) whose email has a
// row in the Supabase `users` table.
//
// To grant access to a new user: scripts/grant-access.sh <email> [months]
// (adds the row; `months` also opens Anna). No code change or deploy needed.
// To revoke access: delete their row from the `users` table.
//
// Response: { allowed, email, subscribed } — `subscribed` is the Anna
// (AI tutor) subscription window from users.access_until; the app greys
// Anna out when it is false.

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const key = publishableKey();
    if (!key) return missingKeyResponse({ allowed: false });

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse({ allowed: false });

    const row = await fetchAccessRow(session.email, key);
    return json(200, {
      allowed: !!row,
      email: session.email,
      subscribed: !!row && subscriptionActive(row.access_until),
    });
  } catch (err) {
    console.error("checkAccess error:", err);
    return json(500, { allowed: false });
  }
};
