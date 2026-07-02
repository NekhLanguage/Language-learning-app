// speech.mjs
// Speaking practice via the Web Speech API's SpeechRecognition — free,
// built into Chrome/Safari, and (in Chrome) covering all 13 app languages
// including Norwegian. Pure adapter + comparison logic; app.js owns the UI.
// Everything degrades gracefully: no API → the mic affordance never shows;
// recognition errors/timeouts → null (caller shows "try again").

export function speechRecognitionAvailable(root = globalThis) {
  return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
}

// Runs one recognition and resolves with the transcript, or null on
// error/timeout/no-speech. Never rejects.
export function recognizeOnce({ lang, timeoutMs = 8000 }, root = globalThis) {
  const Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    let rec;
    try {
      rec = new Ctor();
    } catch {
      return settle(null);
    }

    const timer = setTimeout(() => {
      try { rec.abort(); } catch { /* already stopped */ }
      settle(null);
    }, timeoutMs);

    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => settle(e?.results?.[0]?.[0]?.transcript ?? null);
    rec.onerror = () => settle(null);
    rec.onend = () => settle(null); // fires after onresult; settle() dedupes

    try {
      rec.start();
    } catch {
      settle(null);
    }
  });
}

// Word-level comparison of the expected sentence against the transcript:
// [{ word, heard }] in expected order. Case- and punctuation-insensitive.
export function compareSpoken(expectedSentence, transcript) {
  const words = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[.,!?;:„“”«»"'()【】。、！？]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const heard = new Set(words(transcript));
  return words(expectedSentence).map((word) => ({ word, heard: heard.has(word) }));
}
