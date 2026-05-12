// POST /.netlify/functions/submitBug
// Body: { message, language, support, email, version, userAgent, url }
// Inserts a row into the Supabase `bug_reports` table so the team can
// review reports in the Supabase dashboard.
//
// To set up the table, run the SQL in /migrations/bug_reports.sql against
// the project's Supabase instance (Supabase Dashboard → SQL Editor).

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const message = (payload.message || "").trim();

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Message is required" })
      };
    }

    const row = {
      message: message.slice(0, 4000),
      language: payload.language ? String(payload.language).slice(0, 32) : null,
      support: payload.support ? String(payload.support).slice(0, 32) : null,
      email: payload.email ? String(payload.email).toLowerCase().trim().slice(0, 320) : null,
      version: payload.version ? String(payload.version).slice(0, 32) : null,
      user_agent: payload.userAgent ? String(payload.userAgent).slice(0, 512) : null,
      url: payload.url ? String(payload.url).slice(0, 1024) : null
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/bug_reports`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(row)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Supabase insert error:", res.status, text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to save bug report" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("submitBug error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
};
