// TTS Netlify Function.
// Supports GET (cacheable) and POST (legacy). Identical text+lang always
// produces the same audio, so we set long-lived Cache-Control + Netlify CDN
// cache headers — repeat playback is served from browser/edge cache.
//
// The Google client is hoisted to module scope so warm function instances
// reuse it instead of re-initializing on every request.

const textToSpeech = require("@google-cloud/text-to-speech");

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

exports.handler = async (event) => {
  try {
    let text = "";
    let lang = "";

    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      text = typeof q.text === "string" ? q.text : "";
      lang = typeof q.lang === "string" ? q.lang : "";
    } else if (event.httpMethod === "POST") {
      if (!event.body) throw new Error("Missing request body");
      const parsed = JSON.parse(event.body);
      text = parsed.text || "";
      lang = parsed.lang || "";
    } else {
      return { statusCode: 405, body: "" };
    }

    if (!text) throw new Error("Missing text");
    if (text.length > MAX_TEXT_LEN) throw new Error("Text too long");
    if (!lang) throw new Error("Missing lang");

    const [response] = await getClient().synthesizeSpeech({
      input: { text },
      voice: { languageCode: lang, ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" }
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // Browser cache forever (text+lang is the cache key via the URL).
        "Cache-Control": "public, max-age=31536000, immutable",
        // Netlify edge cache forever — first user warms it, everyone benefits.
        "Netlify-CDN-Cache-Control": "public, max-age=31536000, immutable"
      },
      body: response.audioContent.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error("TTS ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
