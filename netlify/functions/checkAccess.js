const { usersKey, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow, subscriptionActive } = require("./auth");
const { FREE_LESSONS, provisionTrial, tierOf, isTrialRow } = require("./entitlement");

// Who may use the app: the signed-in learner (Supabase Auth session token in
// the Authorization header — the request body is ignored).
//
// Free tier (Nekh 2026-09-30): a verified account with no `users` row gets
// a free-tier row here, on its first sign-in (see entitlement.js). The row
// is created only for a verified session, so typing someone else's email
// on the sign-up form creates nothing but an unconfirmed auth account.
// Existing rows are never touched.
//
// To grant full access by hand: scripts/grant-access.sh <email> [months]
// (sets access_tier = 'paid'; `months` also opens Anna).
//
// Response: { allowed, email, tier, freeLessons, subscribed } — `tier` is
// "trial" or "paid"; `subscribed` is the Anna window and is always false
// for a trial account. The client uses these to lock lessons and Anna;
// the server re-checks both (saveUser, tutor.js).

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const key = usersKey();
    if (!key) return missingKeyResponse({ allowed: false });

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse({ allowed: false });

    let row = await fetchAccessRow(session.email, key);
    if (!row) {
      await provisionTrial(session.email);
      row = await fetchAccessRow(session.email, key);
    }
    return json(200, {
      allowed: !!row,
      email: session.email,
      tier: tierOf(row),
      freeLessons: FREE_LESSONS,
      subscribed: !!row && !isTrialRow(row) && subscriptionActive(row.access_until),
    });
  } catch (err) {
    console.error("checkAccess error:", err);
    return json(500, { allowed: false });
  }
};
