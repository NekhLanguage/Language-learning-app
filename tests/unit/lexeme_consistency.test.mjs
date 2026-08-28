// Unit tests for the dictionary-vs-corpus matching rule
// (validation/lib/lexeme-match-core.mjs): the ko lexeme-swap class must be
// caught; legitimate inflections of the right word must not be.

import { test } from "node:test";
import assert from "node:assert/strict";
import { entryCandidates, surfaceMatchesEntry }
  from "../../validation/lib/lexeme-match-core.mjs";

test("a genuine lexeme swap is caught (the ko 받다/얻다 · 저/나 class)", () => {
  // Dictionary said 얻다 while every native model sentence used 받다.
  assert.equal(surfaceMatchesEntry("받아요",
    entryCandidates({ base: "얻다", present: "얻어요" }),
    { allowPrefix: false }), false);
  // Dictionary said casual 나 while the corpus is polite 저.
  assert.equal(surfaceMatchesEntry("저",
    entryCandidates(["나", "내"]), { allowPrefix: false }), false);
  // The zh phone-word split: corpus 手机, dictionary 电话.
  assert.equal(surfaceMatchesEntry("手机",
    entryCandidates({ form: "电话" }), { allowPrefix: false }), false);
});

test("any authored field of the entry matches exactly", () => {
  const pl = entryCandidates({
    base: "jeść", "1_singular": "jem", "3_singular": "je" });
  assert.equal(surfaceMatchesEntry("jem", pl), true);
  // Arrays (pronouns) and nested maps (tr possessed) count too.
  assert.equal(surfaceMatchesEntry("내",
    entryCandidates(["나", "내"])), true);
  assert.equal(surfaceMatchesEntry("yiyeceğim",
    entryCandidates({ form: "yiyecek", possessed: { "1s": "yiyeceğim" } })), true);
});

test("engine-derived case forms are never flagged (uk «їжу» from «їжа»)", () => {
  assert.equal(surfaceMatchesEntry("їжу",
    entryCandidates({ form: "їжа", genitive: "їжі" }),
    { derived: ["їжу"], allowPrefix: true }), true);
});

test("whole-word containment covers article/preposition-carrying surfaces", () => {
  assert.equal(surfaceMatchesEntry("a casa",
    entryCandidates({ form: "casa" })), true);
  assert.equal(surfaceMatchesEntry("do domu",
    entryCandidates({ form: "dom", genitive: "domu" })), true);
});

test("the prefix fallback only fires where inflection machinery is declared", () => {
  const cands = entryCandidates({ form: "kobieta" });
  // Inflecting language: «kobietą» (instrumental) tolerated.
  assert.equal(surfaceMatchesEntry("kobietą", cands, { allowPrefix: true }), true);
  // Non-inflecting language: same near-miss is a finding.
  assert.equal(surfaceMatchesEntry("kobietą", cands, { allowPrefix: false }), false);
  // And a real swap never sneaks through the prefix rule.
  assert.equal(surfaceMatchesEntry("mężczyzna", cands, { allowPrefix: true }), false);
});
