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
    return { leveledUp: false, exhaustedLevelUps: false };
  }

  state.streak++;

  let leveledUp = false;
  const needed = state.level === 1 ? 1 : 2;

  if (state.streak >= needed) {
    if (sessionLevelUps >= 3) {
      state.streak = 0;
      return { leveledUp: false, exhaustedLevelUps: true };
    }

    if (state.level < levelCap) {
      state.level++;
      leveledUp = true;
    } else {
      state.completed = true;
    }
    state.streak = 0;
  }

  return { leveledUp, exhaustedLevelUps: false };
}
