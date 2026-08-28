// lexeme-match-core.mjs
// Pure matching logic for the dictionary-vs-corpus consistency check
// (validate-lexeme-consistency.mjs): does a native surface word from the
// authored template corpus plausibly belong to the dictionary entry for
// the same concept? Extracted so the unit suite can pin the rule on real
// fixtures (the ko 받다/얻다 lexeme swap must be caught; uk's
// strategy-derived «їжу» must not be flagged).
//
// Matching, in order — the first hit wins:
//   1. Exact: the surface equals any authored string of the entry
//      (form/base/array items/every object field, one level into nested
//      maps like tr `possessed`).
//   2. Contained: a candidate appears as a whole word inside a multi-word
//      surface («a casa» vs dictionary «casa», «do domu» vs «dom»+genitive
//      «domu»).
//   3. Derived: engine-computed case forms supplied by the caller (the
//      declared fem-accusative strategies, case fields) — computed with
//      the real engine so the check can never drift from the renderer.
//   4. Prefix fallback, ONLY for languages that declare inflection
//      machinery (case marking / possessive suffixes / adjective
//      declension): longest common prefix ≥ max(2, shorterLen − 2).
//      A genuine lexeme swap shares no prefix and stays caught.

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[.,!?;:«»"()]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Every authored string reachable in a dictionary entry.
export function entryCandidates(entry) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string' && v.trim()) out.add(norm(v)); };
  const walk = (v, depth) => {
    if (typeof v === 'string') { add(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth)); return; }
    if (v && typeof v === 'object' && depth < 2) {
      for (const [k, val] of Object.entries(v)) {
        if (k === 'gender' || typeof val === 'boolean') continue;
        walk(val, depth + 1);
      }
    }
  };
  walk(entry, 0);
  return out;
}

function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function surfaceMatchesEntry(surface, candidates, {
  derived = [],
  allowPrefix = false,
} = {}) {
  const s = norm(surface);
  if (!s) return true; // nothing to check
  const all = new Set([...candidates, ...derived.map(norm).filter(Boolean)]);
  if (all.has(s)) return true;                       // 1 + 3 exact
  const words = s.split(' ');
  for (const c of all) {                             // 2: whole-word containment
    if (!c) continue;
    if (words.includes(c)) return true;
    if (c.includes(' ') && (s.includes(c) || c.includes(s))) return true;
  }
  if (allowPrefix) {                                 // 4: guarded prefix
    for (const c of all) {
      for (const w of words) {
        const shorter = Math.min(w.length, c.length);
        if (shorter >= 2 &&
            commonPrefixLen(w, c) >= Math.max(2, shorter - 2)) return true;
      }
    }
  }
  return false;
}

export { norm as normalizeLexeme };
