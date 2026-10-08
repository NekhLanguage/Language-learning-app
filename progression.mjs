// progression.mjs
// Pure progression rules for the 7-level mastery ladder: per-concept state,
// spacing (spaced repetition by exercise distance), and the level-up state
// machine. No DOM, no app state — app.js supplies the inputs, unit tests
// exercise the rules directly.

export const MAX_LEVEL = 7;

export function createProgress() {
  return {
    level: 1,
    streak: 0,
    completed: false,
    lastShownAt: -Infinity,
    lastResult: null,
    // Where the concept came from ("pack" | "tutor") — schema v2. Admission
    // metadata is only set for tutor-admitted concepts.
    provenance: "pack",
    admittedFrom: null,
    // Fast track (schema v6, see applyAnswer): on after a level is cleared
    // with no miss, off at the first miss. missedAtLevel records a miss at
    // the current level and resets on every level-up.
    fastTrack: false,
    missedAtLevel: false,
  };
}

// Spacing rule: how many exercises must pass before a concept may reappear.
// `currentIndex` is the run's exercise counter. `opts.l7CorrectGap` lets the
// caller shrink level 7's long post-success gap in the end-game, where a
// small active pool would otherwise starve every session (default 20).
export function passesSpacing(state, currentIndex, opts = {}) {
  if (state.lastShownAt === -Infinity) return true;

  const distance = currentIndex - state.lastShownAt;

  // Level 1 → always available (exposure only)
  if (state.level === 1) return true;

  // Level 7: long gap after a success, quick retry after a miss
  if (state.level === 7) {
    return state.lastResult === false ? distance >= 2 : distance >= (opts.l7CorrectGap ?? 20);
  }

  // Levels 2–6
  return state.lastResult === false ? distance >= 2 : distance >= 4;
}

// The ceiling a concept can climb to. Recognition-only concepts stop at
// L4; everything else — modifiers included — climbs to MAX_LEVEL. Modifiers
// were capped at 5 while L6/L7 couldn't render them safely; with symmetric
// drilled-modifier seeding fenced at L6/L7, the full ladder is back
// (Nekh ruling 2026-08-28: L7 must test modifiers too). Concepts already
// completed at the old cap stay completed — the cap only gates promotion.
export function levelCapFor({ isRecognition }) {
  if (isRecognition) return 4;
  return MAX_LEVEL;
}

// Re-opens every concept marked completed below its level cap (Nekh
// 2026-10-08). Modifiers used to cap at L5; when the full ladder came back
// (2026-08-28) the ones already completed at L5 stayed completed, and a
// completed concept is never practiced again — so they could never reach
// L7, never count as mastered on the leaderboard, and never got their L6/L7
// practice. They resume at the level they reached. `capOf(cid)` is the
// concept's current cap. Returns how many were reopened.
export function reopenBelowCap(progress, capOf) {
  if (!progress || typeof progress !== "object") return 0;
  let n = 0;
  for (const [cid, p] of Object.entries(progress)) {
    if (!p || typeof p !== "object" || p.completed !== true) continue;
    if (!(Number(p.level) < capOf(cid))) continue;
    p.completed = false;
    p.streak = 0;
    n++;
  }
  return n;
}

// Fast track (Nekh 2026-10-08): a learner who already knows a word should
// reach new words sooner. A level normally takes two correct answers. When
// a word clears a level from L2 up with no miss at that level (two right,
// first try), it goes on the fast track: from then on ONE correct answer
// moves it up a level. The first miss takes it off, and it needs two again
// until it clears another level cleanly, which puts it back on.
// The last step — completing the word at its cap — always takes two: that
// is the mastery check, and it is what the leaderboard counts.
export function answersNeeded(state, levelCap) {
  if (state.level === 1) return 1;
  if (state.fastTrack && state.level < levelCap) return 1;
  return 2;
}

// Applies one answer to a concept's progress state (mutating it, as the
// app does) and reports what happened:
//   { leveledUp, exhaustedLevelUps }
// exhaustedLevelUps=true reproduces the app's early-exit: a concept that
// already leveled up 3 times this session banks nothing further from the
// streak it just finished.
export function applyAnswer(state, { correct, exerciseIndex, levelCap, sessionLevelUps }) {
  state.lastShownAt = exerciseIndex;
  state.lastResult = correct;

  if (!correct) {
    state.streak = 0;
    state.missedAtLevel = true;
    state.fastTrack = false;
    return { leveledUp: false, exhaustedLevelUps: false };
  }

  state.streak++;

  let leveledUp = false;
  const needed = answersNeeded(state, levelCap);

  if (state.streak >= needed) {
    if (sessionLevelUps >= 3) {
      state.streak = 0;
      return { leveledUp: false, exhaustedLevelUps: true };
    }

    // A level from L2 up cleared with no miss earns (or keeps) the fast
    // track. L1 is exposure only, so it says nothing about the learner.
    if (state.level >= 2 && !state.missedAtLevel) state.fastTrack = true;

    if (state.level < levelCap) {
      state.level++;
      state.missedAtLevel = false;
      leveledUp = true;
    } else {
      state.completed = true;
    }
    state.streak = 0;
  }

  return { leveledUp, exhaustedLevelUps: false };
}
