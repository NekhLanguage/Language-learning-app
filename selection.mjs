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

// 0 since Nekh's 2026-10-03 call: tutor-admitted words weigh exactly the
// same as pack words. The boost machinery stays (one constant brings it
// back) but every concept now weighs 1 at every stage of the base.
export const PACK_SELECTION_BOOST_MAX = 0;

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

// The level-bucket pick behind chooseConcept, pure so the starvation that
// hid Anna's words can be reproduced in a unit test.
//
// Candidates are bucketed by level and a level is drawn by weighted random
// (L1 = 7 down to L7 = 1 while the release plan still has bundles; equal
// weights once it is exhausted — "review mode"). Within the bucket:
//   review mode — the stalest `stalePool` RENDERABLE words, weighted pick;
//   otherwise   — a weighted pick among the bucket, re-drawn without the
//                 pick when it turns out not to render.
// `canRender(cid)` is the renderability test (app.js passes
// canConceptBeIntroduced / canConceptBeTested). It is what the old code
// lacked: the stalest-3 pool used to be filled by words that can NEVER
// render at their level (NOT, PLEASE, MAYBE, THANKS, YES, NO have no three
// same-type peers for an L2 question), the render loop excluded them and
// re-drew a random level, and a word behind six such blockers — every
// Anna word, which lands at L2 right after its intro — needed the same
// level drawn seven times in one render to surface. It never was.
// A bucket with nothing renderable drops its level and another is drawn;
// null when no level has a renderable word.
export function pickFromLevelBuckets(candidates, {
  levelOf,
  lastShownAt,
  canRender = () => true,
  weightOf = () => 1,
  planExhausted = false,
  stalePool = 3,
  rng = Math.random,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const byLevel = new Map();
  for (const c of candidates) {
    const l = Number(levelOf(c)) || 1;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(c);
  }
  const at = (c) => {
    const shown = lastShownAt(c);
    return shown === -Infinity || shown === null || shown === undefined ? -1 : Number(shown);
  };

  while (byLevel.size) {
    const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    const weights = levels.map((l) => (planExhausted ? 1 : Math.max(1, 8 - l)));
    const total = weights.reduce((acc, w) => acc + w, 0);
    let r = rng() * total;
    let chosenLevel = levels[levels.length - 1];
    for (let i = 0; i < levels.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosenLevel = levels[i]; break; }
    }
    const bucket = byLevel.get(chosenLevel);

    if (planExhausted) {
      // Stalest-first with a little variety: the `stalePool` words that have
      // waited longest AND can render, weighted-random among them.
      const byStaleness = [...bucket].sort((a, b) => at(a) - at(b));
      const pool = [];
      for (const c of byStaleness) {
        if (!canRender(c)) continue;
        pool.push(c);
        if (pool.length >= stalePool) break;
      }
      if (pool.length) return weightedPickFrom(pool, weightOf, rng);
    } else {
      const live = [...bucket];
      while (live.length) {
        const pick = weightedPickFrom(live, weightOf, rng);
        if (canRender(pick)) return pick;
        live.splice(live.indexOf(pick), 1);
      }
    }
    byLevel.delete(chosenLevel);
  }
  return null;
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
