// progression.mjs
// Pure progression rules for the 7-level mastery ladder: per-concept state,
// spacing (spaced repetition by exercise distance), speed-aware cooldowns,
// and the level-up state machine. No DOM, no app state — app.js supplies
// the inputs, unit tests exercise the rules directly.

export const MAX_LEVEL = 7;

// Speed-aware cooldown: fast recall pushes the next review out,
// slow recall pulls it in for reinforcement.
export function cooldownForElapsed(ms) {
  if (ms <= 0) return 4;          // no timing signal — treat as normal
  if (ms < 4000) return 8;         // fast: push review further out
  if (ms > 15000) return 2;        // slow: bring it back soon
  return 4;                         // normal
}

export function createProgress() {
  return {
    level: 1,
    streak: 0,
    cooldown: 0,
    completed: false,
    lastShownAt: -Infinity,
    lastResult: null,
  };
}

// Spacing rule: how many exercises must pass before a concept may reappear.
// `currentIndex` is the run's exercise counter.
export function passesSpacing(state, currentIndex) {
  if (state.lastShownAt === -Infinity) return true;

  const distance = currentIndex - state.lastShownAt;

  // Level 1 → always available (exposure only)
  if (state.level === 1) return true;

  // Level 7: long gap after a success, quick retry after a miss
  if (state.level === 7) {
    return state.lastResult === false ? distance >= 2 : distance >= 20;
  }

  // Levels 2–6
  return state.lastResult === false ? distance >= 2 : distance >= 4;
}

// The ceiling a concept can climb to. Recognition-only concepts stop at
// L4, modifiers (adjectives/numbers) at L5, everything else at MAX_LEVEL.
export function levelCapFor({ isRecognition, isModifier }) {
  if (isRecognition) return 4;
  if (isModifier) return 5;
  return MAX_LEVEL;
}

// Applies one answer to a concept's progress state (mutating it, as the
// app does) and reports what happened:
//   { leveledUp, exhaustedLevelUps }
// exhaustedLevelUps=true reproduces the app's early-exit: a concept that
// already leveled up 3 times this session banks nothing further from the
// streak it just finished.
export function applyAnswer(state, { correct, exerciseIndex, elapsedMs, levelCap, sessionLevelUps }) {
  state.lastShownAt = exerciseIndex;
  state.lastResult = correct;

  if (!correct) {
    state.streak = 0;
    state.cooldown = 2;
    return { leveledUp: false, exhaustedLevelUps: false };
  }

  state.streak++;
  state.cooldown = cooldownForElapsed(elapsedMs);

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
