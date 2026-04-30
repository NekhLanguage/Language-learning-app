// audioengine.js
// Centralized TTS handler (Cloud + fallback) with prefetch + highlighting.

let ttsEnabled = false;
let voices = [];

function loadVoices() {
  voices = speechSynthesis.getVoices();
}

loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

// Populated at startup by app.js via setVoiceMap()
let voiceMap = {};

export function setVoiceMap(map) {
  voiceMap = map;
}

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
// URL builder — identical text+lang produces the same URL, so the browser's
// HTTP cache and Netlify's CDN can serve repeat playback instantly.
// --------------------

function ttsUrl(text, lang) {
  return (
    "/.netlify/functions/tts?text=" +
    encodeURIComponent(text) +
    "&lang=" +
    encodeURIComponent(lang)
  );
}

// --------------------
// Prefetch — warms the browser/CDN cache so playback feels instant when the
// user finally clicks the speaker. Safe to call repeatedly; in-flight
// requests are deduped.
// --------------------

const inflightPrefetches = new Set();

export function prefetchTTS(text, lang) {
  if (!text) return;
  const cloudLang = voiceMap[lang] || lang;
  const url = ttsUrl(text, cloudLang);
  if (inflightPrefetches.has(url)) return;
  inflightPrefetches.add(url);
  fetch(url, { method: "GET" })
    .catch(() => {})
    .finally(() => inflightPrefetches.delete(url));
}

// --------------------
// Cloud TTS (primary)
// --------------------

function playCloudTTS(text, lang) {
  const cloudLang = voiceMap[lang] || lang;
  const url = ttsUrl(text, cloudLang);
  const audio = new Audio(url);
  return { audio, playPromise: audio.play() };
}

// --------------------
// Browser fallback
// --------------------

function speakBrowser(text, lang) {
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const langLower = (lang || "").toLowerCase();
  let voice = voices.find(v => v.lang.toLowerCase() === langLower);
  if (!voice) voice = voices.find(v => v.lang.toLowerCase().startsWith(langLower));
  if (!voice) voice = voices.find(v => v.lang.toLowerCase().includes(langLower));
  if (voice) utter.voice = voice;
  else utter.lang = voiceMap[lang] || lang;
  utter.rate = 0.9;
  utter.pitch = 1;
  speechSynthesis.speak(utter);
  return utter;
}

// --------------------
// Main speak function
// --------------------

export async function speak(text, lang) {
  if (!ttsEnabled || !text) return;
  try {
    const { playPromise } = playCloudTTS(text, lang);
    await playPromise;
  } catch (err) {
    console.warn("Cloud TTS failed, using browser fallback");
    speakBrowser(text, lang);
  }
}

// Speak regardless of ttsEnabled — for explicit user taps (e.g. alphabet cards)
export async function speakAlways(text, lang) {
  if (!text) return;
  try {
    const { playPromise } = playCloudTTS(text, lang);
    await playPromise;
  } catch {
    speakBrowser(text, lang);
  }
}

// --------------------
// Sentence autoplay
// --------------------

export function speakSentenceOnLoad(text, lang) {
  if (!ttsEnabled) return;
  setTimeout(() => speak(text, lang), 200);
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
    try { await speak(words[i], lang); } catch {}
    i++;
    setTimeout(speakNext, 150);
  }
  speakNext();
}

// --------------------
// Highlighting (Path A — proportional estimation)
//
// Both helpers play the audio and listen to `timeupdate`, then highlight the
// child span whose cumulative character fraction matches the audio's playhead.
// Drift is small for short utterances; long sentences may visibly lag near
// the end, but the alternative (Google word-time pointing) requires SSML
// marks and a larger refactor.
// --------------------

function runHighlight(audio, spans, fractions, cleanupExtra) {
  let activeIdx = -1;

  const onTime = () => {
    if (!audio.duration || !isFinite(audio.duration)) return;
    const frac = audio.currentTime / audio.duration;
    let idx = spans.length - 1;
    for (let i = 0; i < fractions.length; i++) {
      if (frac < fractions[i]) { idx = i; break; }
    }
    if (idx !== activeIdx) {
      if (activeIdx >= 0 && spans[activeIdx]) spans[activeIdx].classList.remove("tts-active");
      if (spans[idx]) spans[idx].classList.add("tts-active");
      activeIdx = idx;
    }
  };

  const cleanup = () => {
    audio.removeEventListener("timeupdate", onTime);
    audio.removeEventListener("ended", cleanup);
    audio.removeEventListener("error", cleanup);
    audio.removeEventListener("pause", onPause);
    if (activeIdx >= 0 && spans[activeIdx]) spans[activeIdx].classList.remove("tts-active");
    if (typeof cleanupExtra === "function") cleanupExtra();
  };

  const onPause = () => {
    if (audio.ended) cleanup();
  };

  audio.addEventListener("timeupdate", onTime);
  audio.addEventListener("ended", cleanup);
  audio.addEventListener("error", cleanup);
  audio.addEventListener("pause", onPause);
}

export async function speakWithHighlight(text, lang, phraseSpan) {
  if (!text) return;

  const wordSpans = phraseSpan
    ? Array.from(phraseSpan.querySelectorAll(".tts-word"))
    : [];

  const fractions = [];
  if (wordSpans.length > 0) {
    const totalChars = wordSpans.reduce((sum, s) => sum + s.textContent.length, 0) || 1;
    let acc = 0;
    for (const s of wordSpans) {
      acc += s.textContent.length;
      fractions.push(acc / totalChars);
    }
  }

  try {
    const { audio, playPromise } = playCloudTTS(text, lang);
    if (wordSpans.length > 0) runHighlight(audio, wordSpans, fractions);
    await playPromise;
  } catch {
    speakBrowser(text, lang);
  }
}

// Letter-by-letter on alphabet cards. Replaces the char element's text with
// per-letter spans for the duration of playback, then restores the original.
export async function speakLetters(text, lang, charEl) {
  if (!text) return;

  let letterSpans = [];
  let originalHtml = null;
  let cleanupExtra = null;

  if (charEl && charEl.textContent) {
    originalHtml = charEl.innerHTML;
    const original = charEl.textContent;
    charEl.textContent = "";
    for (const ch of Array.from(original)) {
      const s = document.createElement("span");
      s.className = "tts-letter";
      s.textContent = ch;
      charEl.appendChild(s);
      letterSpans.push(s);
    }
    cleanupExtra = () => { charEl.innerHTML = originalHtml; };
  }

  const fractions = letterSpans.map((_, i) => (i + 1) / letterSpans.length);

  try {
    const { audio, playPromise } = playCloudTTS(text, lang);
    if (letterSpans.length > 0) runHighlight(audio, letterSpans, fractions, cleanupExtra);
    await playPromise;
  } catch {
    if (cleanupExtra) cleanupExtra();
    speakBrowser(text, lang);
  }
}
