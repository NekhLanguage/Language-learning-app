// Unit tests for the progression rules (progression.mjs): spacing, level caps,
// and the level-up state machine.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LEVEL,
  createProgress,
  passesSpacing,
  levelCapFor,
  applyAnswer,
} from "../../progression.mjs";

test("fresh progress always passes spacing", () => {
  assert.equal(passesSpacing(createProgress(), 0), true);
  assert.equal(passesSpacing(createProgress(), 100), true);
});

test("level 1 always passes spacing", () => {
  const s = { ...createProgress(), level: 1, lastShownAt: 10, lastResult: true };
  assert.equal(passesSpacing(s, 10), true);
});

test("levels 2-6: distance 4 after success, 2 after a miss", () => {
  const base = { ...createProgress(), level: 3, lastShownAt: 10 };
  assert.equal(passesSpacing({ ...base, lastResult: true }, 13), false);
  assert.equal(passesSpacing({ ...base, lastResult: true }, 14), true);
  assert.equal(passesSpacing({ ...base, lastResult: false }, 11), false);
  assert.equal(passesSpacing({ ...base, lastResult: false }, 12), true);
});

test("level 7: distance 20 after success, 2 after a miss", () => {
  const base = { ...createProgress(), level: 7, lastShownAt: 10 };
  assert.equal(passesSpacing({ ...base, lastResult: true }, 29), false);
  assert.equal(passesSpacing({ ...base, lastResult: true }, 30), true);
  assert.equal(passesSpacing({ ...base, lastResult: false }, 12), true);
});

test("level 7: the post-success gap can be shrunk for the end-game", () => {
  const base = { ...createProgress(), level: 7, lastShownAt: 10, lastResult: true };
  assert.equal(passesSpacing(base, 15, { l7CorrectGap: 4 }), true);
  assert.equal(passesSpacing(base, 13, { l7CorrectGap: 4 }), false);
  // The option does not touch the after-a-miss rule or other levels.
  assert.equal(passesSpacing({ ...base, lastResult: false }, 12, { l7CorrectGap: 4 }), true);
  assert.equal(passesSpacing({ ...createProgress(), level: 3, lastShownAt: 10, lastResult: true }, 13, { l7CorrectGap: 4 }), false);
});

test("level caps: recognition 4, everything else — modifiers included — MAX_LEVEL", () => {
  assert.equal(levelCapFor({ isRecognition: true, isModifier: false }), 4);
  // Modifiers climb the full ladder: L6/L7 seed the drilled modifier
  // symmetrically and fence prompt/answer parity (Nekh ruling 2026-08-28).
  assert.equal(levelCapFor({ isRecognition: false, isModifier: true }), MAX_LEVEL);
  assert.equal(levelCapFor({ isRecognition: false, isModifier: false }), MAX_LEVEL);
  // Recognition wins if both are set (matches the app's ternary order).
  assert.equal(levelCapFor({ isRecognition: true, isModifier: true }), 4);
});

test("a modifier completed at the old level-5 cap stays completed", () => {
  // Live learner state written before the cap lift: level 5, completed:true.
  // The cap only gates promotion — applyAnswer never un-completes, so the
  // lift cannot retroactively re-open mastered modifiers (the app's
  // selection already skips completed concepts entirely).
  const s = { ...createProgress(), level: 5, completed: true, streak: 1 };
  applyAnswer(s, {
    correct: true, exerciseIndex: 3, levelCap: MAX_LEVEL, sessionLevelUps: 0,
  });
  assert.equal(s.completed, true);
});

const answer = (state, overrides = {}) =>
  applyAnswer(state, {
    correct: true,
    exerciseIndex: 0,
    levelCap: MAX_LEVEL,
    sessionLevelUps: 0,
    ...overrides,
  });

test("a wrong answer resets the streak", () => {
  const s = { ...createProgress(), level: 3, streak: 1 };
  const out = answer(s, { correct: false, exerciseIndex: 7 });
  assert.deepEqual(out, { leveledUp: false, exhaustedLevelUps: false });
  assert.equal(s.streak, 0);
  assert.equal(s.lastResult, false);
  assert.equal(s.lastShownAt, 7);
  assert.equal(s.level, 3);
});

test("level 1 needs one correct answer to level up; others need two", () => {
  const l1 = createProgress();
  assert.equal(answer(l1).leveledUp, true);
  assert.equal(l1.level, 2);
  assert.equal(l1.streak, 0);

  const l2 = { ...createProgress(), level: 2 };
  assert.equal(answer(l2).leveledUp, false);
  assert.equal(l2.level, 2);
  assert.equal(l2.streak, 1);
  assert.equal(answer(l2).leveledUp, true);
  assert.equal(l2.level, 3);
});

test("reaching the level cap marks the concept completed", () => {
  const s = { ...createProgress(), level: 4, streak: 1 };
  const out = answer(s, { levelCap: 4 });
  assert.equal(out.leveledUp, false);
  assert.equal(s.completed, true);
  assert.equal(s.level, 4);
  assert.equal(s.streak, 0);
});

test("three session level-ups block further progress this session", () => {
  const s = { ...createProgress(), level: 3, streak: 1 };
  const out = answer(s, { sessionLevelUps: 3 });
  assert.deepEqual(out, { leveledUp: false, exhaustedLevelUps: true });
  assert.equal(s.level, 3);
  assert.equal(s.streak, 0);
});
