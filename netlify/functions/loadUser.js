const fetch = require("node-fetch");

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc"; // keep your existing key

exports.handler = async (event) => {
  try {
    const { email } = JSON.parse(event.body || "{}");

    // 🔥 Normalize email (CRITICAL FIX)
    const normalized = email?.toLowerCase().trim();

    if (!normalized) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email" })
      };
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const data = await res.json();

    // Return ONLY the stored user data
    return {
      statusCode: 200,
      body: JSON.stringify({
        user: data?.[0]?.data || null
      })
    };

  } catch (err) {
    console.error("loadUser error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load user" })
    };
  }
};