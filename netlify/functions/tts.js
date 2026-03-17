const textToSpeech = require("@google-cloud/text-to-speech");

exports.handler = async (event) => {
  try {
    const { text, lang } = JSON.parse(event.body);

    const credentials = JSON.parse(
  process.env.GOOGLE_TTS_KEY.replace(/\\n/g, '\n')
);

    const client = new textToSpeech.TextToSpeechClient({
      credentials
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
    console.error(err);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "TTS failed" })
    };
  }
};