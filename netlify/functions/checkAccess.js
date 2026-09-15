const { SUPABASE_URL, publishableKey, restHeaders, missingKeyResponse } = require("./supabase");

// To grant access to a new user: add a row to the Supabase `users` table
// with their email (data column can be null). No code change or deploy needed.
// To revoke access: delete their row from the `users` table.

exports.handler = async (event) => {
  try {
    const { email } = JSON.parse(event.body || "{}");
    const normalized = email?.toLowerCase().trim();

    if (!normalized) {
      return {
        statusCode: 400,
        body: JSON.stringify({ allowed: false })
      };
    }

    const key = publishableKey();
    if (!key) return missingKeyResponse({ allowed: false });

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}&select=email`,
      { headers: restHeaders(key) }
    );

    if (!res.ok) {
      console.error("Supabase error:", res.status, await res.text());
      return {
        statusCode: 500,
        body: JSON.stringify({ allowed: false })
      };
    }

    const data = await res.json();
    const allowed = Array.isArray(data) && data.length > 0;

    return {
      statusCode: 200,
      body: JSON.stringify({ allowed })
    };

  } catch (err) {
    console.error("checkAccess error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ allowed: false })
    };
  }
};
