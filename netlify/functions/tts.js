// TTS Netlify Function.
// Supports GET (cacheable) and POST (legacy). Identical text+lang always
// produces the same audio, so we set long-lived Cache-Control + Netlify CDN
// cache headers — repeat playback is served from browser/edge cache.
//
// The Google client is hoisted to module scope so warm function instances
// reuse it instead of re-initializing on every request.
//
// Error contract (2026-08 outage lesson — Google Cloud billing was disabled
// and every learner silently heard browser voices for months): failures
// return stable reason codes so the client warning and the Netlify function
// log both NAME the problem instead of relaying a raw stack:
//   400 {"error":"bad_request", ...}        — caller sent bad input
//   503 {"error":"tts_unconfigured"}        — credential env vars missing
//   503 {"error":"tts_billing_disabled"}    — Google rejected: enable billing
//                                             on the project (the 2026-08-29
//                                             outage read exactly this)
//   503 {"error":"tts_upstream", ...}       — any other Google-side failure

const textToSpeech = require("@google-cloud/text-to-speech");

// languages.js ttsCode values are browser BCP-47 tags — they also drive the
// Web Speech RECOGNITION language (app.js), so they must stay browser-valid.
// Google Cloud TTS uses different codes for two of them; the alias lives
// here, at the only place that talks to Google.
const GOOGLE_LANG_ALIASES = {
  "ar-SA": "ar-XA",  // Google's Arabic is the multi-region ar-XA
  "zh-CN": "cmn-CN", // Google's documented Mandarin code
};

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new textToSpeech.TextToSpeechClient({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY
        .replace(/\\n/g, "\n")
        .replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n")
        .replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
    }
  });
  return cachedClient;
}

const MAX_TEXT_LEN = 500;

function jsonError(statusCode, error, detail) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(detail ? { error, detail } : { error }),
  };
}

exports.handler = async (event) => {
  let text;
  let lang;

  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    text = typeof q.text === "string" ? q.text : "";
    lang = typeof q.lang === "string" ? q.lang : "";
  } else if (event.httpMethod === "POST") {
    if (!event.body) return jsonError(400, "bad_request", "Missing request body");
    try {
      const parsed = JSON.parse(event.body);
      text = parsed.text || "";
      lang = parsed.lang || "";
    } catch {
      return jsonError(400, "bad_request", "Invalid JSON body");
    }
  } else {
    return { statusCode: 405, body: "" };
  }

  if (!text) return jsonError(400, "bad_request", "Missing text");
  if (text.length > MAX_TEXT_LEN) return jsonError(400, "bad_request", "Text too long");
  if (!lang) return jsonError(400, "bad_request", "Missing lang");

  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error("TTS ERROR: tts_unconfigured — GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY not set");
    return jsonError(503, "tts_unconfigured");
  }

  try {
    const [response] = await getClient().synthesizeSpeech({
      input: { text },
      // No ssmlGender: Google documents NEUTRAL as "not yet supported";
      // omitting the field means "no preference" and lets the service pick
      // a real voice for the language.
      voice: { languageCode: GOOGLE_LANG_ALIASES[lang] || lang },
      audioConfig: { audioEncoding: "MP3" }
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // Browser cache forever (text+lang+gen is the cache key via the URL).
        "Cache-Control": "public, max-age=31536000, immutable",
        // Netlify edge cache forever — first user warms it, everyone benefits.
        "Netlify-CDN-Cache-Control": "public, max-age=31536000, immutable"
      },
      body: response.audioContent.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    const msg = String(err && err.message || err);
    const reason = /PERMISSION_DENIED|billing/i.test(msg)
      ? "tts_billing_disabled"
      : "tts_upstream";
    console.error(`TTS ERROR (${reason}):`, err);
    return jsonError(503, reason, msg);
  }
};
