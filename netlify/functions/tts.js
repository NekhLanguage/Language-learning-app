const textToSpeech = require("@google-cloud/text-to-speech");

exports.handler = async (event) => {
  try {
    if (!event.body) {
      throw new Error("Missing request body");
    }

    let parsed;

    try {
      parsed = JSON.parse(event.body);
    } catch (e) {
      throw new Error("Invalid JSON body");
    }

    const { text, lang } = parsed;

    if (!text || !lang) {
      throw new Error("Missing text or lang");
    }

    if (!process.env.GOOGLE_CLIENT_EMAIL) {
      throw new Error("Missing GOOGLE_CLIENT_EMAIL");
    }

    if (!process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error("Missing GOOGLE_PRIVATE_KEY");
    }

    const client = new textToSpeech.TextToSpeechClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY
      }
    });

    const request = {
      input: { text },
      voice: {
        languageCode: lang,
        ssmlGender: "NEUTRAL"
      },
      audioConfig: {
        audioEncoding: "MP3"
      }
    };

    const [response] = await client.synthesizeSpeech(request);

    return {
      statusCode: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: response.audioContent.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error("TTS ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};