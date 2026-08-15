// selection.mjs
// Pure helpers for the base-vocab selection weighting shipped 2026-08-15
// (Nekh's Q3 addendum on the tutor→app vocabulary write-back scope spec).
// Pack concepts get a slight per-candidate boost so tutor-admitted words
// don't crowd the curated 250-word method out of the exercise stream, and
// the boost decays with pack-base completion so the end-game (pack fully
// mastered) doesn't starve the remaining tutor pool.
//
// app.js applies these inside chooseConcept — this file exists so the math
// is unit-testable in isolation, and lifts trivially into a future engine
// refactor if selection stops living inside app.js.

export const PACK_SELECTION_BOOST_MAX = 0.5;

// Fraction of released pack-provenance concepts that have hit their level
// cap. Tutor-admitted concepts are ignored — the "base" is the pack.
export function baseCompletionRatio(released, progress) {
  if (!Array.isArray(released) || !progress) return 0;
  let total = 0, done = 0;
  for (const cid of released) {
    const p = progress[cid];
    if (!p || p.provenance === "tutor") continue;
    total++;
    if (p.completed) done++;
  }
  return total === 0 ? 0 : done / total;
}

// The per-candidate weight for a pack concept: 1.5 at zero base completion,
// linearly falling to 1.0 at full base mastery. Never below 1 (parity with
// tutor).
export function packSelectionBoost(baseCompletion) {
  const clamped = Math.max(0, Math.min(1, Number(baseCompletion) || 0));
  return 1 + PACK_SELECTION_BOOST_MAX * (1 - clamped);
}

// Weight for a single concept in the chooseConcept bucket. Tutor concepts
// weigh 1 flat; pack concepts weigh packSelectionBoost(baseCompletion).
export function conceptSelectionWeight(isTutor, baseCompletion) {
  return isTutor ? 1 : packSelectionBoost(baseCompletion);
}

// Weighted random pick. `weightFn(item)` must return a non-negative number.
// If every weight is zero (or the list is empty), returns null so the
// caller can decide how to fall back.
export function weightedPickFrom(items, weightFn, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weights = items.map((it) => Math.max(0, Number(weightFn(it)) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
