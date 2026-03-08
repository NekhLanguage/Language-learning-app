// audioengine.js
// Centralized TTS handler

let ttsEnabled = false;

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

  // Prevent overlapping speech
  if (speechSynthesis.speaking) return;

  const utter = new SpeechSynthesisUtterance(text);

  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.startsWith(lang));

  if (voice) {
    utter.voice = voice;
  } else {
    utter.lang = voiceMap[lang] || lang;
  }

  utter.rate = 0.9;
  utter.pitch = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

// Sentence autoplay (Levels 1–2)
export function speakSentenceOnLoad(text, lang) {

  if (!ttsEnabled) return;

  setTimeout(() => {
    speak(text, lang);
  }, 200);
}

// Sentence with blank pause (Level 3)
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

    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(lang));

    if (voice) {
      utter.voice = voice;
    } else {
      utter.lang = voiceMap[lang] || lang;
    }

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