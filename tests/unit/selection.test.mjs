// Unit tests for the base-vocab selection weighting (selection.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PACK_SELECTION_BOOST_MAX,
  baseCompletionRatio,
  packSelectionBoost,
  conceptSelectionWeight,
  weightedPickFrom,
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

test("packSelectionBoost decays from 1.5 at zero completion to 1.0 at full", () => {
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
