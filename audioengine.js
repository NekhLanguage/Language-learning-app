// audioEngine.js
// Centralized TTS handler for the app

let ttsEnabled = false;
let currentUtterance = null;

const voiceMap = {
  en: "en-US",
  pt: "pt-BR",
  no: "nb-NO",
  ja: "ja-JP",
  ar: "ar-SA"
};

export function setTTS(state) {
  ttsEnabled = state;
}

export function isTTSEnabled() {
  return ttsEnabled;
}

export function speak(text, lang) {

  if (!ttsEnabled) return;
  if (!text) return;

  const utter = new SpeechSynthesisUtterance(text);

  utter.lang = voiceMap[lang] || lang;
  utter.rate = 0.9;
  utter.pitch = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
  speechSynthesis.cancel();
}

// Plays automatically when exercise loads
export function speakSentenceOnLoad(text, lang) {

  if (!ttsEnabled) return;

  setTimeout(() => {
    speak(text, lang);
  }, 150);
}
export function speakSentenceWithPause(words, lang, blankIndex) {

  if (!ttsEnabled) return;

  let i = 0;

  function speakNext() {

    if (i >= words.length) return;

    if (i === blankIndex) {
      i++;
      setTimeout(speakNext, 500);
      return;
    }

    const utter = new SpeechSynthesisUtterance(words[i]);
    utter.lang = voiceMap[lang] || lang;
    utter.rate = 0.9;

    utter.onend = () => {
      i++;
      speakNext();
    };

    speechSynthesis.speak(utter);
  }

  speechSynthesis.cancel();
  speakNext();
}