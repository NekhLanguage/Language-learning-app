const zlib = require("zlib");
const { SUPABASE_URL, publishableKey, restHeaders, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse } = require("./auth");

// Returns the signed-in learner's own record. The email comes from the
// verified Supabase session token (Authorization header), never from the
// request body, so one account can no longer read another's progress.
exports.handler = async (event) => {
  try {
    const key = publishableKey();
    if (!key) return missingKeyResponse();

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const normalized = session.email;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(normalized)}`,
      { headers: restHeaders(key) }
    );

    const data = await res.json();

    // Return ONLY the stored user data. Gzipped when the client accepts it:
    // a full account is ~450 KB of highly repetitive JSON (Emi run-16 -79:
    // 18.6 s cold, one 504) and compresses roughly ten to one. The browser
    // decodes Content-Encoding transparently; a client without gzip in its
    // Accept-Encoding gets the plain body as before.
    const json = JSON.stringify({ user: data?.[0]?.data || null });
    const accept = String(
      (event.headers && (event.headers["accept-encoding"] || event.headers["Accept-Encoding"])) || ""
    );
    if (/\bgzip\b/i.test(accept)) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Cache-Control": "no-store",
          "Vary": "Accept-Encoding"
        },
        body: zlib.gzipSync(json).toString("base64"),
        isBase64Encoded: true
      };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: json
    };

  } catch (err) {
    console.error("loadUser error:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load user" })
    };
  }
};