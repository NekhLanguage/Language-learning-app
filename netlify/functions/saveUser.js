const fetch = require("node-fetch");

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_KEY_HERE"; // keep your existing key

exports.handler = async (event) => {
  try {
    const { email, user } = JSON.parse(event.body || "{}");

    // 🔥 Normalize email (CRITICAL FIX)
    const normalized = email?.toLowerCase().trim();

    if (!normalized || !user) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email or user data" })
      };
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        email: normalized,
        data: user
      })
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