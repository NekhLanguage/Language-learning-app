// Admin read endpoint for the `events` table.
// Returns recent rows, filtered by ?email= and/or ?type= and/or ?limit=.
// Protected by ADMIN_TOKEN env var: pass it via ?token= or X-Admin-Token header.
//
// Examples:
//   /.netlify/functions/getEvents?token=XYZ&type=session_complete&limit=200
//   /.netlify/functions/getEvents?token=XYZ&email=jane@example.com
//
// Set ADMIN_TOKEN in Netlify env vars (any random string). Without it, the
// function returns 503 — events stay readable from Supabase directly.

const SUPABASE_URL = "https://miprvzsfunbmjippzrxf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pcHJ2enNmdW5ibWppcHB6cnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODA1NjMsImV4cCI6MjA4OTY1NjU2M30.78ONiXxrznbsAw-bEX_haMmrbRoV5t6vkfxzzwIw0lc";

exports.handler = async (event) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return { statusCode: 503, body: JSON.stringify({ error: "ADMIN_TOKEN not configured" }) };
  }

  const q = event.queryStringParameters || {};
  const token = q.token || event.headers["x-admin-token"] || event.headers["X-Admin-Token"] || "";
  if (token !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const limit = Math.min(parseInt(q.limit, 10) || 100, 1000);
  const params = new URLSearchParams();
  params.set("select", "at,type,email,payload");
  params.set("order", "at.desc");
  params.set("limit", String(limit));
  if (q.email) params.set("email", `eq.${q.email.toLowerCase().trim()}`);
  if (q.type) params.set("type", `eq.${q.type}`);

  const readKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?${params.toString()}`, {
      headers: { "apikey": readKey, "Authorization": `Bearer ${readKey}` }
    });
    if (!res.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: await res.text() }) };
    }
    const rows = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err && err.message }) };
  }
};
