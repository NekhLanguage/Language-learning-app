// What the browser needs to talk to Supabase Auth: the project URL and the
// publishable key. The publishable key is designed to be public (RLS is
// what protects the data), but it is read from the environment here so the
// repo never carries it and a rotation needs no code change — the browser
// fetches this once per boot and caches it in localStorage.

const { SUPABASE_URL, publishableKey } = require("./supabase");

exports.handler = async () => {
  const key = publishableKey();
  if (!key) {
    console.error("authConfig: SUPABASE_PUBLISHABLE_KEY is not set in the function environment");
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Supabase not configured (SUPABASE_PUBLISHABLE_KEY unset)" }),
    };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ url: SUPABASE_URL, publishableKey: key }),
  };
};
