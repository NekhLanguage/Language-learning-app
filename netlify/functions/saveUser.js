const { SUPABASE_URL, publishableKey, restHeaders, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse } = require("./auth");

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

    const key = publishableKey();
    if (!key) return missingKeyResponse();

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const normalized = session.email;

    // Update the existing row only (every account with access has one —
    // addUser / grant-access.sh create it). A revoked account, whose row
    // was deleted, can therefore no longer re-create itself by saving.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}`, {
      method: "PATCH",
      headers: restHeaders(key, {
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }),
      body: JSON.stringify({ data: user })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Supabase save error:", text);

      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to save user" })
      };
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