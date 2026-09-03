// tutor_exercises.mjs
// Pure helpers behind the L5–L7 exercises for tutor-admitted concepts.
// A tutor concept lives on run.tutorVocab[cid] — word, translation, note,
// pos, and the example sentence Anna used when she introduced it
// (exampleSentence / exampleTranslation). GLOBAL_VOCAB and the sentence
// templates know nothing about it, so the sentence-level exercises are
// seeded from that banked example instead of the engine. No DOM here;
// app.js renders, unit tests exercise the rules directly.

// Which production task a tutor entry can support:
//   sentence — the banked example exists on both sides: prompt is the
//              support-language translation, answer is Anna's sentence.
//   word     — no banked sentence (entries captured before the field
//              existed): prompt is the translation, answer is the word.
export function tutorProductionTask(entry) {
  const sentence = String(entry?.exampleSentence || "").trim();
  const translation = String(entry?.exampleTranslation || "").trim();
  if (sentence && translation) {
    return { mode: "sentence", prompt: translation, answer: sentence };
  }
  return {
    mode: "word",
    prompt: String(entry?.translation || "").trim(),
    answer: String(entry?.word || "").trim(),
  };
}

// Word tiles for the L6 builder: whitespace tokens with edge punctuation
// stripped, lowercased (the builder compares lowercase, as L6 does).
// Returns [] when the sentence has fewer than two tiles — a spaceless
// script (ja/zh/th) or a one-word example — so the caller can fall back to
// typed production rather than show a one-tile "builder".
export function tutorExampleTiles(sentence) {
  const tiles = String(sentence || "")
    .split(/\s+/)
    .map((t) => t.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "").toLowerCase())
    .filter(Boolean);
  return tiles.length >= 2 ? tiles : [];
}

// Same normalisation ladder as the pack L7 grader: exact (minus case,
// edge whitespace and a final stop) → accent-insensitive → wrong.
export function normalizeStrict(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[.!?。！？]$/, "");
}

export function normalizeLoose(str) {
  return normalizeStrict(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function gradeTyped(userInput, answer) {
  if (!String(userInput || "").trim()) return "incorrect";
  if (normalizeStrict(userInput) === normalizeStrict(answer)) return "perfect";
  if (normalizeLoose(userInput) === normalizeLoose(answer)) return "accent";
  return "incorrect";
}

// Tutor concepts skip L3 and L4 (no template to blank or to build
// recognition options from — Nekh's call 2026-09-03: L5/L6/L7 are the
// levels worth having). A tutor concept found at 3 or 4 — fresh from an L2
// level-up, or a stale blob — is lifted to 5. Returns true when it moved.
export function liftTutorLevel(progress) {
  if (!progress) return false;
  if (progress.level === 3 || progress.level === 4) {
    progress.level = 5;
    return true;
  }
  return false;
}
