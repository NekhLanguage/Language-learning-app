const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

// To call this endpoint, POST:
//   { "email": "buyer@example.com" }
//   with header: X-Webhook-Secret: <your secret>
//
// Set WEBHOOK_SECRET in Netlify → Site configuration → Environment variables.
// Generate a random secret, e.g.: openssl rand -hex 32

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    // Validate secret token from header
    const incomingSecret = event.headers["x-webhook-secret"];
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error("WEBHOOK_SECRET env var not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) };
    }

    if (incomingSecret !== expectedSecret) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const { email } = JSON.parse(event.body || "{}");
    const normalized = email?.toLowerCase().trim();

    if (!normalized) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email" }) };
    }

    // Upsert into Supabase users table — grants access on next login
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ email: normalized, data: null })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Supabase error:", res.status, text);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to add user" }) };
    }

    console.log("User granted access:", normalized);
    return { statusCode: 200, body: JSON.stringify({ success: true, email: normalized }) };

  } catch (err) {
    console.error("addUser error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
