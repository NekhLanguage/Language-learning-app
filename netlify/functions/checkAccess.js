const fetch = require("node-fetch");

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

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

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}&select=email`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      }
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
