const textToSpeech = require("@google-cloud/text-to-speech");

const client = new textToSpeech.TextToSpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_TTS_KEY)
});

exports.handler = async (event) => {
  const { text, lang } = JSON.parse(event.body);

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
    headers: {
      "Content-Type": "audio/mpeg"
    },
    body: response.audioContent.toString("base64"),
    isBase64Encoded: true
  };
};