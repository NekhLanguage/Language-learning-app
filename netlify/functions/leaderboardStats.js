// Leaderboard v1 (Nekh 2026-10-02): the two counters, computed from a saved
// user blob. Pure functions — no fetch, no env — shared by saveUser (which
// stores them on the users row in the same PATCH as the blob) and the dev
// server stub, and exercised directly by the unit tests.
//
// CommonJS because every Netlify function is; the progression constants
// are mirrored here rather than imported from the ESM progression.mjs.

// progression.mjs MAX_LEVEL. A concept is "mastered" when it has passed the
// level-7 test: applyAnswer sets completed = true at the level cap, and the
// cap is 7 for everything except recognition-only concepts (cap 4), which
// therefore never count here.
const MASTERY_LEVEL = 7;

const MIN_NAME = 2;
const MAX_NAME = 24;

function runsOf(user) {
  const runs = user && typeof user === "object" ? user.runs : null;
  return runs && typeof runs === "object" ? Object.values(runs) : [];
}

// Words mastered: progress entries completed at level 7, across every run.
function countMasteredWords(user) {
  let n = 0;
  for (const run of runsOf(user)) {
    const progress = run && typeof run === "object" ? run.progress : null;
    if (!progress || typeof progress !== "object") continue;
    for (const p of Object.values(progress)) {
      if (p && p.completed === true && Number(p.level) >= MASTERY_LEVEL) n++;
    }
  }
  return n;
}

// Words encountered with Anna: concepts she (or the learner, in her
// sessions) brought into the ladder, plus the words still being captured
// toward admission. Mirrors tutor_profile.mjs wordCountLabel's "tutor"
// tally, summed across runs. Admitted words leave personalVocab /
// pendingAdmission on admission (tutor_admission.mjs), so nothing is
// counted twice.
function countAnnaWords(user) {
  let n = 0;
  for (const run of runsOf(user)) {
    if (!run || typeof run !== "object") continue;
    const progress = run.progress && typeof run.progress === "object" ? run.progress : {};
    for (const p of Object.values(progress)) {
      if (p && p.provenance === "tutor") n++;
    }
    if (Array.isArray(run.personalVocab)) n += run.personalVocab.length;
    if (Array.isArray(run.pendingAdmission)) n += run.pendingAdmission.length;
  }
  return n;
}

function computeLeaderboardStats(user) {
  return { words: countMasteredWords(user), anna: countAnnaWords(user) };
}

// A display name the board will show: trimmed, inner whitespace collapsed,
// control characters out, 2–24 characters. Returns null when nothing
// usable is left. Letters in any script are fine (Nekh's learners write
// Cyrillic, Greek, kana); only the characters that could break a line of
// the board or look like markup are refused.
function normalizeDisplayName(raw) {
  if (typeof raw !== "string") return null;
  // Whitespace (tabs included) collapses to one space BEFORE the control
  // characters go, so "Nekh\tthe Great" keeps its word break.
  let name = raw.replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex -- stripping C0 controls is the point
  name = name.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, "").trim();
  if (/[<>&"'`]/.test(name)) return null;
  if (name.length < MIN_NAME || name.length > MAX_NAME) return null;
  return name;
}

module.exports = {
  MASTERY_LEVEL,
  MIN_NAME,
  MAX_NAME,
  countMasteredWords,
  countAnnaWords,
  computeLeaderboardStats,
  normalizeDisplayName,
};
