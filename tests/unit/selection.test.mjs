// Unit tests for the base-vocab selection weighting (selection.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PACK_SELECTION_BOOST_MAX,
  baseCompletionRatio,
  packSelectionBoost,
  conceptSelectionWeight,
  weightedPickFrom,
  pickFromLevelBuckets,
} from "../../selection.mjs";

const packProgress = (completed) => ({
  level: completed ? 7 : 3,
  streak: 0,
  completed,
  lastShownAt: -Infinity,
  lastResult: null,
  provenance: "pack",
  admittedFrom: null,
});
const tutorProgress = (completed) => ({
  level: completed ? 2 : 1,
  streak: 0,
  completed,
  lastShownAt: -Infinity,
  lastResult: null,
  provenance: "tutor",
  admittedFrom: { mode: "tutor", sessionDate: "2026-08-15" },
});

test("baseCompletionRatio ignores tutor concepts and counts pack completion", () => {
  const released = ["A", "B", "C", "TUTOR_X", "TUTOR_Y"];
  const progress = {
    A: packProgress(true),
    B: packProgress(true),
    C: packProgress(false),
    TUTOR_X: tutorProgress(false),
    TUTOR_Y: tutorProgress(true),
  };
  assert.equal(baseCompletionRatio(released, progress), 2 / 3);
});

test("baseCompletionRatio returns 0 when no pack concepts are released", () => {
  assert.equal(baseCompletionRatio(["TUTOR_A"], { TUTOR_A: tutorProgress(false) }), 0);
  assert.equal(baseCompletionRatio([], {}), 0);
  assert.equal(baseCompletionRatio(null, null), 0);
});

test("packSelectionBoost: no boost at all since Nekh's 2026-10-03 equal-weight call (constant is 0)", () => {
  assert.equal(PACK_SELECTION_BOOST_MAX, 0);
  assert.equal(packSelectionBoost(0), 1);
  assert.equal(conceptSelectionWeight(false, 0), conceptSelectionWeight(true, 0));
});

test("packSelectionBoost decays from 1 + MAX at zero completion to 1.0 at full", () => {
  assert.equal(packSelectionBoost(0), 1 + PACK_SELECTION_BOOST_MAX);
  assert.equal(packSelectionBoost(0.5), 1 + PACK_SELECTION_BOOST_MAX * 0.5);
  assert.equal(packSelectionBoost(1), 1);
  // Out-of-range inputs clamp instead of overshooting.
  assert.equal(packSelectionBoost(-1), 1 + PACK_SELECTION_BOOST_MAX);
  assert.equal(packSelectionBoost(2), 1);
  assert.equal(packSelectionBoost(NaN), 1 + PACK_SELECTION_BOOST_MAX);
});

test("conceptSelectionWeight: pack is boosted mid-base, equal at end-game", () => {
  assert.equal(conceptSelectionWeight(false, 0), 1 + PACK_SELECTION_BOOST_MAX);
  assert.equal(conceptSelectionWeight(true, 0), 1);
  assert.equal(conceptSelectionWeight(false, 1), 1);
  assert.equal(conceptSelectionWeight(true, 1), 1);
});

test("weightedPickFrom biases toward higher-weight items over many draws", () => {
  // Two items, weights 3 and 1 → the heavier one should be picked ~75% of
  // the time. Use a deterministic sequence rather than Math.random so the
  // test never flakes.
  const seq = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  let idx = 0;
  const rng = () => seq[idx++ % seq.length];
  const picks = { A: 0, B: 0 };
  for (let i = 0; i < seq.length; i++) {
    const pick = weightedPickFrom(["A", "B"], (it) => (it === "A" ? 3 : 1), rng);
    picks[pick]++;
  }
  assert.ok(picks.A > picks.B, `expected A > B, got ${JSON.stringify(picks)}`);
});

test("weightedPickFrom falls back to uniform when every weight is zero", () => {
  // Even a degenerate weight function shouldn't return null when there are
  // items — the caller expects _something_ to render.
  const rng = () => 0;
  assert.equal(weightedPickFrom(["A", "B", "C"], () => 0, rng), "A");
});

test("weightedPickFrom returns null on empty input", () => {
  assert.equal(weightedPickFrom([], () => 1), null);
  assert.equal(weightedPickFrom(null, () => 1), null);
});

// --- pickFromLevelBuckets: the starvation that hid Anna's words ----------

// Deterministic pseudo-random (LCG) for coverage-style assertions: a short
// cycling sequence would lock the level draw and the in-pool draw in step.
function lcg(seed = 12345) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}

// Nekh's Ukrainian run on 2026-10-03, reduced: six pack words that can never
// build an L2 question (NOT, PLEASE, MAYBE, THANKS, YES, NO — no three
// same-type peers) sat at L2 with the oldest lastShownAt, 18 Anna words sat
// at L2 right behind them, and the release plan was exhausted (review mode).
function nekhRun() {
  const level = {}, shown = {};
  const blockers = ["NOT", "PLEASE", "MAYBE", "THANKS", "YES", "NO"];
  blockers.forEach((c, i) => { level[c] = 2; shown[c] = 742 + i * 100; });
  const anna = ["TUTOR_ВИХІДНИЙ", "TUTOR_КЛАСНИЙ", "TUTOR_БАГАТО"];
  anna.forEach((c, i) => { level[c] = 2; shown[c] = 1547 + i; });
  const l7 = ["EAT", "FOOD", "DRINK"];
  l7.forEach((c, i) => { level[c] = 7; shown[c] = 1557 + i; });
  const candidates = [...blockers, ...anna, ...l7];
  return {
    candidates, blockers, anna, l7,
    levelOf: (c) => level[c],
    lastShownAt: (c) => shown[c],
    canRender: (c) => !blockers.includes(c),
  };
}

test("review mode: the stalest-pool walk skips words that cannot render, so Anna's L2 words surface", () => {
  const r = nekhRun();
  // rng 0 draws the lowest level (L2) and the first pool entry.
  const pick = pickFromLevelBuckets(r.candidates, { ...r, planExhausted: true, rng: () => 0 });
  assert.equal(pick, "TUTOR_ВИХІДНИЙ", "the stalest RENDERABLE L2 word, not NOT");
  // Over many draws every Anna word and every L7 word comes up; no blocker ever does.
  const seen = new Set();
  const rng = lcg(7);
  for (let n = 0; n < 200; n++) seen.add(pickFromLevelBuckets(r.candidates, { ...r, planExhausted: true, rng }));
  for (const b of r.blockers) assert.ok(!seen.has(b), `${b} must never be picked`);
  for (const a of r.anna) assert.ok(seen.has(a), `${a} should surface`);
  for (const w of r.l7) assert.ok(seen.has(w), `${w} should surface`);
});

test("the old behaviour, for the record: without canRender the pool is the six blockers", () => {
  const r = nekhRun();
  const pick = pickFromLevelBuckets(r.candidates, { ...r, canRender: () => true, planExhausted: true, rng: () => 0 });
  assert.equal(pick, "NOT");
});

test("a level whose bucket has nothing renderable is dropped and another level is drawn", () => {
  const r = nekhRun();
  const onlyL7 = (c) => r.l7.includes(c);
  // rng 0 keeps drawing L2 first; L2 has nothing renderable → L7 instead.
  const pick = pickFromLevelBuckets(r.candidates, { ...r, canRender: onlyL7, planExhausted: true, rng: () => 0 });
  assert.equal(pick, "EAT");
  assert.equal(pickFromLevelBuckets(r.candidates, { ...r, canRender: () => false, planExhausted: true }), null);
});

test("while the plan still has bundles: weighted level draw, and an unrenderable pick is re-drawn within the bucket", () => {
  const r = nekhRun();
  // rng 0: L2 (weight 6) is drawn and the first bucket entry picked; NOT
  // cannot render, so the walk continues inside the bucket until an Anna
  // word comes up — never a blocker, never a level change.
  const pick = pickFromLevelBuckets(r.candidates, { ...r, planExhausted: false, rng: () => 0 });
  assert.ok(r.anna.includes(pick), `expected an Anna word, got ${pick}`);
  // Levels are weighted 8 - L while bundles remain: L2 weighs 6, L7 weighs 1.
  const rng = lcg(99);
  const counts = { l2: 0, l7: 0 };
  for (let n = 0; n < 200; n++) {
    const p = pickFromLevelBuckets(r.candidates, { ...r, planExhausted: false, rng });
    if (r.l7.includes(p)) counts.l7++; else counts.l2++;
  }
  assert.ok(counts.l2 > counts.l7, `L2 should dominate while bundles remain: ${JSON.stringify(counts)}`);
});

test("pickFromLevelBuckets: empty input is null", () => {
  assert.equal(pickFromLevelBuckets([], { levelOf: () => 1, lastShownAt: () => -Infinity }), null);
});
