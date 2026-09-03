// tutor_admission.mjs
// Tutor→app vocabulary write-back: the admission pipeline (schema v2).
// Pure functions over the run's personalVocab / pendingAdmission lists — no
// DOM, no fetch — so unit tests exercise the policy directly.
//
// Policy (locked by Nekh 2026-08-14 on the write-back scope spec):
//   - A word is admitted to the mastery ladder after being seen in THREE
//     tutor sessions on distinct days (threshold 3 — the real gate).
//   - At most TEN admissions per session (almost never binds; the threshold
//     is the control that matters).
//   - Propose-then-confirm via repetition: session 1 captures to
//     personalVocab, a second distinct-day sighting promotes to
//     pendingAdmission, a third admits. No UI ceremony.
//   - Admitted words are REMOVED from personalVocab/pendingAdmission
//     (bounded-context draining rule: enumerating them twice is waste).
//   - CID collision with pack vocabulary skips the admission entirely —
//     the pack word will teach it better.

import { createProgress } from "./progression.mjs";

export const ADMISSION_THRESHOLD = 3;
export const MAX_ADMISSIONS_PER_SESSION = 10;

// Concept id for a tutor-admitted word: TUTOR_ + uppercased word with
// everything but letters/digits stripped. Uppercase keeps parity with pack
// CID style (WATER, HOUSE) and works for non-Latin scripts (Cyrillic
// uppercases; CJK passes through unchanged).
export function tutorCid(word) {
  const slug = String(word || "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  return `TUTOR_${slug}`;
}

// Script-aware occurrence test: for spaced scripts, require the word to not
// be embedded in a longer word; for CJK/kana (where every neighbor is a
// letter and boundary lookarounds would always fail) fall back to a plain
// substring match.
const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿]/u;

export function wordUsedInText(word, text) {
  const w = String(word || "").trim();
  if (!w || !text) return false;
  const haystack = String(text);
  if (CJK_RE.test(w)) return haystack.includes(w);
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(haystack);
  } catch {
    return haystack.toLowerCase().includes(w.toLowerCase());
  }
}

// Appends `today` to an entry's seenInSessions unless it was already sighted
// today — the threshold counts distinct DAYS, per Nekh's Q1 reasoning
// ("three separate conversations spread across days").
function recordSighting(entry, today) {
  if (!Array.isArray(entry.seenInSessions)) entry.seenInSessions = [];
  if (entry.seenInSessions[entry.seenInSessions.length - 1] !== today) {
    entry.seenInSessions.push(today);
  }
}

// Runs one end-of-session pass over the run's tutor-vocab state.
//   run           — USER.runs[lang] (personalVocab/pendingAdmission mutated in place)
//   newWords      — this session's summary.newWords ([{word, translation, note, pos}])
//   assistantText — concatenated assistant turns (repeat-sighting detection:
//                   the tutor re-USING a captured word counts, since the
//                   summary only reports words outside the profile and so
//                   rarely re-reports an already-captured one)
//   today         — ISO date string (YYYY-MM-DD)
//   isCidTaken    — (cid) => bool, collision guard against pack vocabulary
//   recycledWords — this session's summary.recycledWords: held words the
//                   tutor says it used, in dictionary form. The text scan
//                   above only matches the exact dictionary form, so an
//                   inflected reuse (uk «корисного» for «корисний») never
//                   counted and adjectives/verbs stalled at one sighting
//                   (Nekh 2026-09-03). The model knows the lemma; trust it.
// Returns { admitted: [entry...], collided: [entry...] }. The caller applies
// them via applyAdmissions() / logs collisions.
export function processTutorSession(run, newWords, assistantText, today, isCidTaken, recycledWords = []) {
  if (!Array.isArray(run.personalVocab)) run.personalVocab = [];
  if (!Array.isArray(run.pendingAdmission)) run.pendingAdmission = [];

  const byWord = new Map();
  for (const e of [...run.personalVocab, ...run.pendingAdmission]) {
    if (e && e.word) byWord.set(String(e.word).toLowerCase(), e);
  }

  // 1. Sightings from this session's summary. A word we already hold gets a
  //    repeat sighting; a genuinely new one is captured to personalVocab.
  for (const w of Array.isArray(newWords) ? newWords : []) {
    if (!w || !w.word) continue;
    const key = String(w.word).toLowerCase();
    const existing = byWord.get(key);
    if (existing) {
      recordSighting(existing, today);
    } else if (run.personalVocab.length < 200) {
      const entry = {
        word: w.word,
        translation: w.translation || "",
        note: w.note || "",
        pos: w.pos || "noun",
        // Banked at first-sighting so the sentence the tutor actually used
        // to introduce the word travels with it into admission. Words
        // captured before this field existed have empty strings —
        // provenance-ledger, they simply won't seed sentence-based
        // exercises later. Missing example is not a rejection reason.
        exampleSentence: w.exampleSentence || "",
        exampleTranslation: w.exampleTranslation || "",
        seenInSessions: [today],
        admittedAt: null,
      };
      run.personalVocab.push(entry);
      byWord.set(key, entry);
    }
  }

  // 2. Sightings from the conversation itself: the tutor re-used a held word.
  if (assistantText) {
    for (const entry of byWord.values()) {
      if (entry.seenInSessions?.[entry.seenInSessions.length - 1] === today) continue;
      if (wordUsedInText(entry.word, assistantText)) recordSighting(entry, today);
    }
  }

  // 2b. Sightings the tutor reported itself (recycledWords): matched by
  //     dictionary form against held entries; unknown words are ignored.
  for (const w of Array.isArray(recycledWords) ? recycledWords : []) {
    const entry = byWord.get(String(w || "").trim().toLowerCase());
    if (entry) recordSighting(entry, today);
  }

  // 3. Promotion: two distinct-day sightings moves personalVocab → pendingAdmission.
  const promoted = run.personalVocab.filter((e) => (e.seenInSessions?.length || 0) >= 2);
  if (promoted.length) {
    run.personalVocab = run.personalVocab.filter((e) => !promoted.includes(e));
    run.pendingAdmission.push(...promoted);
  }

  // 4. Admission: threshold reached, capped per session, oldest-first-sighting
  //    seniority as the tiebreak. Collisions with pack CIDs are dropped
  //    (log-only) — the pack word will teach it better.
  const ripe = run.pendingAdmission
    .filter((e) => (e.seenInSessions?.length || 0) >= ADMISSION_THRESHOLD)
    .sort((a, b) => String(a.seenInSessions[0]).localeCompare(String(b.seenInSessions[0])));

  const admitted = [];
  const collided = [];
  for (const entry of ripe) {
    if (admitted.length >= MAX_ADMISSIONS_PER_SESSION) break;
    if (isCidTaken && isCidTaken(tutorCid(entry.word))) collided.push(entry);
    else admitted.push(entry);
  }
  run.pendingAdmission = run.pendingAdmission.filter(
    (e) => !admitted.includes(e) && !collided.includes(e)
  );

  return { admitted, collided };
}

// Applies admissions to the run: the concept enters run.released with a
// fresh progress entry stamped provenance "tutor", and the word's data is
// kept on run.tutorVocab so the app (intro card / exercises, later PRs) can
// render a concept GLOBAL_VOCAB knows nothing about. Until that rendering
// lands, exercise selection naturally skips these cids (no template ever
// references them), so admission is invisible to the session flow.
export function applyAdmissions(run, admitted, today) {
  if (!admitted?.length) return [];
  if (!Array.isArray(run.released)) run.released = [];
  if (!run.progress || typeof run.progress !== "object") run.progress = {};
  if (!run.tutorVocab || typeof run.tutorVocab !== "object") run.tutorVocab = {};

  const applied = [];
  for (const entry of admitted) {
    const cid = tutorCid(entry.word);
    if (run.released.includes(cid)) continue; // already admitted on another device
    run.released.push(cid);
    run.progress[cid] = {
      ...createProgress(),
      provenance: "tutor",
      admittedFrom: { mode: "tutor", sessionDate: today },
    };
    run.tutorVocab[cid] = {
      word: entry.word,
      translation: entry.translation || "",
      note: entry.note || "",
      pos: entry.pos || "noun",
      // Example sentence banked at first-sighting travels with the word into
      // the mastery ladder. Later renderers (L3/L4/L6/L7) can seed
      // exercises from it. Empty for entries captured before the field
      // existed — that's the provenance ledger, not a bug.
      exampleSentence: entry.exampleSentence || "",
      exampleTranslation: entry.exampleTranslation || "",
    };
    entry.admittedAt = today;
    applied.push({
      cid,
      word: entry.word,
      translation: entry.translation || "",
      pos: entry.pos || "noun",
      sessionsSeen: entry.seenInSessions?.length || ADMISSION_THRESHOLD,
    });
  }
  return applied;
}
