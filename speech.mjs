// speech.mjs
// Speaking practice via the Web Speech API's SpeechRecognition — free,
// built into Chrome/Safari, and (in Chrome) covering all 13 app languages
// including Norwegian. Pure adapter + comparison logic; app.js owns the UI.
// Everything degrades gracefully: no API → the mic affordance never shows;
// recognition errors/timeouts → null (caller shows "try again").

export function speechRecognitionAvailable(root = globalThis) {
  return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
}

// Runs one recognition and resolves with { transcript } on success or
// { error } otherwise, where error is one of:
//   "no-speech"   — nothing heard (silence, timeout, ended without a result)
//   "mic-blocked" — microphone permission denied or no microphone
//   "unsupported" — no API, or the browser can't recognise this language
//   "failed"      — anything else (network, service down)
// Never rejects.
export function recognizeSpeech({ lang, timeoutMs = 8000 }, root = globalThis) {
  const Ctor = root.SpeechRecognition || root.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve({ error: "unsupported" });

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
      return settle({ error: "unsupported" });
    }

    const timer = setTimeout(() => {
      try { rec.abort(); } catch { /* already stopped */ }
      settle({ error: "no-speech" });
    }, timeoutMs);

    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e?.results?.[0]?.[0]?.transcript;
      settle(transcript ? { transcript } : { error: "no-speech" });
    };
    rec.onerror = (e) => settle({ error: speechErrorKind(e?.error) });
    rec.onend = () => settle({ error: "no-speech" }); // fires after onresult; settle() dedupes

    try {
      rec.start();
    } catch {
      settle({ error: "failed" });
    }
  });
}

// Maps a SpeechRecognitionErrorEvent.error code to the kinds above.
export function speechErrorKind(code) {
  switch (code) {
    case "no-speech":
    case "aborted":
      return "no-speech";
    case "not-allowed":
    case "service-not-allowed":
    case "audio-capture":
      return "mic-blocked";
    case "language-not-supported":
      return "unsupported";
    default:
      return "failed";
  }
}

// Transcript-or-null form of recognizeSpeech.
export async function recognizeOnce(opts, root = globalThis) {
  const { transcript } = await recognizeSpeech(opts, root);
  return transcript ?? null;
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
