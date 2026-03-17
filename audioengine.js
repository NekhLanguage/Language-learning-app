// audioengine.js
// Centralized TTS handler (Cloud + fallback)

const TTS_CACHE = new Map();

let ttsEnabled = false;
let voices = [];

function loadVoices() {
  voices = speechSynthesis.getVoices();
}

loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

const voiceMap = {
  en: "en-US",
  pt: "pt-BR",
  no: "nb-NO",
  ja: "ja-JP",
  ar: "ar-SA",
  ko: "ko-KR"
};

// --------------------
// Public controls
// --------------------

export function setTTS(state) {
  ttsEnabled = state;
}

export function isTTSEnabled() {
  return ttsEnabled;
}

// --------------------
// Cloud TTS (primary)
// --------------------

async function fetchCloudTTS(text, lang) {

  const key = lang + ":" + text;

  if (TTS_CACHE.has(key)) {
    const audio = new Audio(TTS_CACHE.get(key));
    await audio.play();
    return;
  }

  const res = await fetch("/.netlify/functions/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, lang })
  });

  if (!res.ok) {
    throw new Error("Cloud TTS failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  TTS_CACHE.set(key, url);

  const audio = new Audio(url);
  await audio.play();
}

// --------------------
// Browser fallback
// --------------------

function speakBrowser(text, lang) {

  speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);

  let voice = voices.find(v => v.lang.toLowerCase() === lang);

  if (!voice) {
    voice = voices.find(v =>
      v.lang.toLowerCase().startsWith(lang)
    );
  }

  if (!voice) {
    voice = voices.find(v =>
      v.lang.toLowerCase().includes(lang)
    );
  }

  if (voice) {
    utter.voice = voice;
  } else {
    utter.lang = voiceMap[lang] || lang;
  }

  utter.rate = 0.9;
  utter.pitch = 1;

  speechSynthesis.speak(utter);
}

// --------------------
// Main speak function
// --------------------

export async function speak(text, lang) {

  if (!ttsEnabled) return;
  if (!text) return;

  try {
    const cloudLang = voiceMap[lang] || lang;
    await fetchCloudTTS(text, cloudLang);
  } catch (err) {
    console.warn("Cloud TTS failed, using browser fallback");
    speakBrowser(text, lang);
  }
}

// --------------------
// Sentence autoplay
// --------------------

export function speakSentenceOnLoad(text, lang) {

  if (!ttsEnabled) return;

  setTimeout(() => {
    speak(text, lang);
  }, 200);
}

// --------------------
// Sentence with pause (Level 3)
// --------------------

export function speakSentenceWithPause(words, lang, blankIndex) {

  if (!ttsEnabled) return;

  let i = 0;

  async function speakNext() {

    if (i >= words.length) return;

    if (i === blankIndex) {
      i++;
      setTimeout(speakNext, 500);
      return;
    }

    try {
      await speak(words[i], lang);
    } catch {
      // fallback handled inside speak()
    }

    i++;
    setTimeout(speakNext, 150);
  }

  speakNext();
}