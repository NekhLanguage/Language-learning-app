const fetch = require("node-fetch");

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_KEY_HERE"; // keep your existing key

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