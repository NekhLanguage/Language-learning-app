// Regression net for the exercise-assembly layer — the blanks, tiles and
// prompt/answer parity that sit between the sentence engine and the
// learner. Born from Emi run 4 (2026-08-27): the Polish launch gate held
// on citation-form tiles (-02), mid-word blanks (-03), the modifier-drop
// prompt/answer mismatch (-01), and adjective agreement in governed slots
// (-04). Each test pins the mechanism that shipped the bug.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import {
  configureEngine,
  buildSentence,
  buildSentenceWithRules,
  blankSentence,
  resolveNounBlank,
  optionSurfaceFor,
  modifierSurfaceFor,
  slotContextFor,
  buildSameTypeOptions,
} from "../../sentence_engine.mjs";

let vocab, templates;
const tplById = (id) => templates.find((t) => t.template_id === id);

before(() => {
  vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999, // suppress random modifier injection
  });
});

// ---------------------------------------------------------------------
// blankSentence: word-boundary anchoring (Emi 2026-08-27-03)
// ---------------------------------------------------------------------

test("blankSentence never cuts a stem out of its inflected form", () => {
  // «dom» must not match inside «domu» — the old unanchored indexOf
  // produced «Ja idę do _____u.» with the case suffix stranded.
  assert.equal(blankSentence("Ja idę do domu.", "dom", "pl"), "Ja idę do domu.");
  assert.equal(blankSentence("Ja idę do domu.", "domu", "pl"), "Ja idę do _____.");
  // Multi-word surfaces still match.
  assert.equal(blankSentence("Ja idę do domu.", "do domu", "pl"), "Ja idę _____.");
  // Spaceless scripts keep plain substring search.
  assert.equal(blankSentence("彼は本を読む。", "本", "ja"), "彼は_____を読む。");
});

// ---------------------------------------------------------------------
// resolveNounBlank + optionSurfaceFor: slot-aware blanks and tiles
// (Emi 2026-08-27-02)
// ---------------------------------------------------------------------

test("pl: predicate-instrumental blank holds the declined word and tiles match", () => {
  const tpl = tplById("SHE_IS_WOMAN");
  const sentence = buildSentence("pl", tpl);
  assert.equal(sentence, "Ona jest kobietą.");
  const blank = resolveNounBlank(sentence, tpl, "pl", "WOMAN");
  assert.ok(blank, "blank resolves");
  assert.equal(blank.blanked, "Ona jest _____.");
  assert.equal(blank.surface, "kobietą");
  assert.equal(blank.slot.position, "predicateNoun");
  assert.equal(blank.slot.caseName, "instrumental");
  // A distractor with instrumental data declines to fit the slot…
  assert.equal(optionSurfaceFor("pl", tpl, "BOOK", blank.slot, { bareMode: blank.bareMode }),
    "książką");
  // …and one without is unusable, not shown in the nominative.
  assert.equal(optionSurfaceFor("pl", tpl, "TICKET", blank.slot, { bareMode: blank.bareMode }),
    null);
});

test("pl: accusative-object blank and tiles agree («pracę», never «praca»)", () => {
  const tpl = tplById("WE_HAVE_JOB");
  const sentence = buildSentence("pl", tpl);
  const blank = resolveNounBlank(sentence, tpl, "pl", "JOB");
  assert.ok(blank, "blank resolves");
  assert.equal(blank.surface, "pracę");
  assert.equal(blank.slot.caseName, "accusative");
  assert.equal(optionSurfaceFor("pl", tpl, "BOOK", blank.slot, { bareMode: blank.bareMode }),
    "książkę");
});

test("pl: preposition-governed blank holds the whole declined word", () => {
  const tpl = tplById("I_GO_HOME");
  const sentence = buildSentence("pl", tpl);
  assert.equal(sentence, "Ja idę do domu.");
  const blank = resolveNounBlank(sentence, tpl, "pl", "HOME");
  assert.ok(blank, "blank resolves");
  // Whole word (authored surface) — never «do _____u.»
  assert.ok(!/\p{L}_____|_____\p{L}/u.test(blank.blanked),
    `mid-word blank: ${blank.blanked}`);
  assert.equal(blank.blanked.replace("_____", blank.surface), sentence);
});

test("feminitive predicate tiles follow the subject («guerrière», f)", () => {
  const tpl = tplById("SHE_IS_WARRIOR");
  const slot = slotContextFor(tpl, "fr", "WARRIOR");
  assert.equal(slot.position, "predicateNoun");
  assert.equal(slot.feminineSubject, true);
  const tile = optionSurfaceFor("fr", tpl, "WARRIOR", slot, { bareMode: true });
  assert.equal(tile, "guerrière");
});

test("it: article languages keep the articled-phrase blank contract", () => {
  const tpl = tplById("SHE_SEES_PHONE");
  const sentence = buildSentence("it", tpl);
  assert.equal(sentence, "Lei vede un telefono.");
  const blank = resolveNounBlank(sentence, tpl, "it", "PHONE");
  assert.equal(blank.blanked, "Lei vede _____.");
  assert.equal(blank.surface, "un telefono");
  assert.equal(blank.bareMode, false);
});

test("buildSameTypeOptions dedupes and filters on the slot surface", () => {
  const tpl = tplById("SHE_IS_WOMAN");
  const slot = slotContextFor(tpl, "pl", "WOMAN");
  const surfaceFn = (cid) =>
    cid === "WOMAN" ? "kobietą" : optionSurfaceFor("pl", tpl, cid, slot, { bareMode: true });
  const opts = buildSameTypeOptions("WOMAN", 4, "pl", surfaceFn);
  assert.ok(opts && opts.length === 4, "four options");
  for (const o of opts) {
    const s = surfaceFn(o);
    assert.ok(s, `option ${o} has a slot surface`);
  }
});

// ---------------------------------------------------------------------
// Modifier agreement in governed slots (Emi 2026-08-27-04)
// ---------------------------------------------------------------------

test("pl: masc-animate accusative carries the adjective («dużego syna»)", () => {
  const tpl = tplById("CX_FIRST_PERSON_SINGULAR_HAVE_SON");
  assert.equal(buildSentence("pl", tpl, "BIG", {}), "Ja mam dużego syna.");
});

test("pl: numeral government carries the adjective («osiem dużych twarzy»)", () => {
  const tpl = tplById("CX_FIRST_PERSON_SINGULAR_SEE_FACE");
  assert.equal(buildSentence("pl", tpl, null, { adj_FACE: "BIG", num_FACE: "EIGHT" }),
    "Ja widzę osiem dużych twarzy.");
});

test("it: plural-only nouns take plural adjective agreement («pantaloni grandi»)", () => {
  const tpl = tplById("THEY_HAVE_PANTS");
  assert.equal(buildSentence("it", tpl, "BIG", {}), "Loro hanno dei pantaloni grandi.");
});

test("pl: feminine accusative adjective agreement («dużą koszulę»)", () => {
  const tpl = tplById("HE_SEES_SHIRT");
  assert.equal(buildSentence("pl", tpl, "BIG", {}), "On widzi dużą koszulę.");
});

test("modifierSurfaceFor mirrors the render path's case shift", () => {
  // «duża» agrees with fem «praca»; the accusative slot shifts it to «dużą».
  assert.equal(modifierSurfaceFor("pl", "BIG", "JOB", {}), "duża");
  assert.equal(modifierSurfaceFor("pl", "BIG", "JOB", { caseName: "accusative" }), "dużą");
  // Masculine heads are untouched by the fem shift.
  assert.equal(modifierSurfaceFor("pl", "BIG", "TICKET", { caseName: "accusative" }), "duży");
});

// ---------------------------------------------------------------------
// Modifier-identity parity (Emi 2026-08-27-01)
// ---------------------------------------------------------------------

test("modifierKeys records which modifier landed on which noun", () => {
  const tpl = tplById("WE_HAVE_JOB");
  const sc = { adj_JOB: "GOOD", num_JOB: null };
  const en = buildSentenceWithRules("en", tpl, null, sc);
  assert.deepEqual(en.modifierKeys, ["adj:GOOD>JOB"]);
  const clean = buildSentenceWithRules("en", tpl, null, { adj_JOB: null, num_JOB: null });
  assert.deepEqual(clean.modifierKeys, []);
});

test("declined early returns pin no-modifier into sharedChoices", () => {
  // The pl target renders the predicate instrumental «kobietą» and skips
  // the modifier branch — the paired en build must NOT roll its own
  // random adjective afterwards ("She is a big woman." prompting
  // «Ona jest kobietą.» was Emi 2026-08-27-01's copular face).
  const tpl = tplById("SHE_IS_WOMAN");
  const sc = {};
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.0, // random injection WOULD fire if unpinned
  });
  try {
    const pl = buildSentenceWithRules("pl", tpl, null, sc);
    assert.equal(pl.sentence, "Ona jest kobietą.");
    assert.equal(pl.hadModifier, false);
    assert.equal(sc.adj_WOMAN, null, "adjective slot pinned by the early return");
    const en = buildSentenceWithRules("en", tpl, null, sc);
    assert.equal(en.hadModifier, false,
      "support build cannot inject after the target pinned the noun");
    assert.deepEqual(en.modifierKeys, pl.modifierKeys);
  } finally {
    configureEngine({
      vocab: () => vocab,
      getReleased: () => Object.keys(vocab.concepts),
      ensureProgress: () => ({ level: 99, completed: false }),
      rng: () => 0.999,
    });
  }
});
