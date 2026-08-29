// audioengine.js
// Centralized TTS handler (Cloud + fallback) with prefetch + highlighting.

let ttsEnabled = false;
let voices = [];

// speechSynthesis only exists in the browser — the guard keeps this module
// importable by the node unit suite (pickBrowserVoice is pure logic).
const HAS_SPEECH = typeof speechSynthesis !== "undefined";

function loadVoices() {
  if (HAS_SPEECH) voices = speechSynthesis.getVoices();
}

loadVoices();
if (HAS_SPEECH) speechSynthesis.onvoiceschanged = loadVoices;

// --------------------
// Fallback telemetry — the 2026-08 outage lesson: Google Cloud billing was
// disabled, every request failed, and EVERY learner silently heard their
// browser's default (American) voice for months because the fallback path
// swallowed errors with bare catch{}. A degraded audio path must be LOUD:
// each fallback logs one structured warning and increments a counter that
// window.__app exposes for tests and field debugging.
// --------------------

const audioFallbacks = { count: 0, skipped: 0, last: null };

export function getAudioFallbacks() {
  return { ...audioFallbacks };
}

function noteFallback(context, lang, err) {
  audioFallbacks.count += 1;
  audioFallbacks.last = {
    context, lang,
    error: err && err.message ? String(err.message) : String(err || "unknown"),
    at: Date.now(),
  };
  console.warn(
    `TTS cloud playback failed (${context}, lang=${lang}) — ` +
    `falling back to browser speech: ${audioFallbacks.last.error}`);
}

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

// Bump when server-side voice selection changes (gender dropped + Google
// language aliases, 2026-08-29): the URL is the cache key for a YEAR of
// browser + CDN cache, so old clips synthesized under the previous voice
// parameters would otherwise keep playing forever.
const TTS_AUDIO_GENERATION = 2;

function ttsUrl(text, lang) {
  return (
    "/.netlify/functions/tts?text=" +
    encodeURIComponent(text) +
    "&lang=" +
    encodeURIComponent(lang) +
    "&gen=" + TTS_AUDIO_GENERATION
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

// Pick a browser voice for the MAPPED BCP-47 code («fi» → «fi-FI»):
// exact tag first, then any voice sharing the primary language subtag.
// Returns null when the browser has no voice for the LANGUAGE — the old
// fuzzy `.includes()` walk plus the default-voice fallthrough is how
// Finnish got read by an American voice: a wrong-language voice actively
// teaches wrong sounds, so "no match" must mean silence, never English.
// Exported for the unit suite (pure function of its inputs).
export function pickBrowserVoice(available, mappedLang) {
  const mapped = String(mappedLang || "").toLowerCase();
  if (!mapped) return null;
  const primary = mapped.split("-")[0];
  return available.find(v => v.lang.toLowerCase() === mapped) ||
    available.find(v => v.lang.toLowerCase().split("-")[0] === primary) ||
    null;
}

function speakBrowser(text, lang) {
  if (!HAS_SPEECH) return null;
  loadVoices(); // the async voiceschanged event may have fired since import
  speechSynthesis.cancel();
  const mapped = voiceMap[lang] || lang;
  const voice = pickBrowserVoice(voices, mapped);
  if (!voice) {
    if (voices.length > 0) {
      // The browser demonstrably has no voice for this language — skip
      // rather than read the text with its (English) default voice.
      audioFallbacks.skipped += 1;
      console.warn(
        `No browser voice for ${mapped} — skipping utterance instead of ` +
        "reading it with a wrong-language voice");
      return null;
    }
    // Voice list not populated (some browsers load it async): hand the
    // browser the BCP-47 tag and let it resolve — unverifiable, but the
    // fallback warning has already fired for this utterance.
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = mapped;
    utter.rate = 0.9;
    utter.pitch = 1;
    speechSynthesis.speak(utter);
    return utter;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.voice = voice;
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
    noteFallback("speak", lang, err);
    speakBrowser(text, lang);
  }
}

// Speak regardless of ttsEnabled — for explicit user taps (e.g. alphabet cards)
export async function speakAlways(text, lang) {
  if (!text) return;
  try {
    const { playPromise } = playCloudTTS(text, lang);
    await playPromise;
  } catch (err) {
    noteFallback("speakAlways", lang, err);
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
  } catch (err) {
    noteFallback("speakWithHighlight", lang, err);
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
  } catch (err) {
    noteFallback("speakLetters", lang, err);
    if (cleanupExtra) cleanupExtra();
    speakBrowser(text, lang);
  }
}
