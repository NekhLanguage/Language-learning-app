const { SUPABASE_URL, usersKey, restHeaders, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow } = require("./auth");
const { isTrialRow, trialBlobViolation } = require("./entitlement");
const { computeLeaderboardStats } = require("./leaderboardStats");

// Saves the signed-in learner's own record. The row is chosen by the
// verified Supabase session token (Authorization header); an `email` in the
// body is ignored, so a request can never write another account's row.
exports.handler = async (event) => {
  try {
    const { user } = JSON.parse(event.body || "{}");

    if (!user) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user data" })
      };
    }

    const key = usersKey();
    if (!key) return missingKeyResponse();

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const normalized = session.email;

    // Free-tier progression gate (Nekh 2026-09-30). The client stops a
    // free account at the lesson-4 paywall; this is the server half, so a
    // devtools edit that releases lesson 4 can't be stored and synced back.
    const row = await fetchAccessRow(normalized, key);
    if (isTrialRow(row)) {
      const violation = trialBlobViolation(user);
      if (violation) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ error: "Lesson 4 onward needs the full app.", ...violation }),
        };
      }
    }

    // Update the existing row only (every account with access has one —
    // addUser / grant-access.sh create it). A revoked account, whose row
    // was deleted, can therefore no longer re-create itself by saving.
    const patchUser = (patch) => fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}`, {
      method: "PATCH",
      headers: restHeaders(key, {
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }),
      body: JSON.stringify(patch)
    });

    // Leaderboard v1 (Nekh 2026-10-02): the two community counters ride
    // the same PATCH as the blob — computed here from what is being
    // stored, never trusted from the client, and costing the save path
    // no extra round-trip. See leaderboardStats.js / leaderboard.js.
    const stats = computeLeaderboardStats(user);
    let res = await patchUser({
      data: user,
      lb_words: stats.words,
      lb_anna: stats.anna,
      lb_updated_at: new Date().toISOString()
    });

    if (!res.ok) {
      const text = await res.text();
      // Until migrations/leaderboard.sql has run, PostgREST rejects the
      // unknown lb_* columns (PGRST204). The blob must still land: store
      // it alone and let the board catch up once the columns exist.
      let detail = text;
      if (/lb_(words|anna|updated_at)/.test(text)) {
        console.warn("saveUser: users.lb_* columns missing — saving the blob alone:", text);
        res = await patchUser({ data: user });
        if (!res.ok) detail = await res.text();
      }
      if (!res.ok) {
        console.error("Supabase save error:", detail);

        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Failed to save user" })
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("saveUser error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
};