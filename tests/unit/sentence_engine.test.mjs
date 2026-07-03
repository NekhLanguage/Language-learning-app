// Direct unit tests for the pure grammar engine. The baseline snapshot
// (validation/validate-sentences.mjs) guards against regressions across every
// template × language; these tests pin down the individual rules so a failure
// points at the exact rule that broke.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import {
  configureEngine,
  buildSentence,
  getVerbForm,
  orderedConceptsForTemplate,
  frenchElision,
  englishIndefiniteArticle,
  pluralize,
  nounPhrase,
  surfaceForm,
  adjectiveSuitsNoun,
  blankSentence,
  ZERO_PRESENT_COPULA,
  PLURAL_EXCEPTIONS,
} from "../../sentence_engine.mjs";

let templates;

before(() => {
  const vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  // Deterministic config, mirroring validate-sentences.mjs: everything
  // released, rng high enough to suppress random modifier injection.
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999,
  });
});

const tplById = (id) => templates.find((t) => t.template_id === id);

test("buildSentence matches the reference render (en, pt)", () => {
  const tpl = tplById("I_EAT_FOOD");
  assert.ok(tpl, "core template I_EAT_FOOD exists");
  assert.equal(buildSentence("en", tpl), tpl.render.en);
  assert.equal(buildSentence("pt", tpl), tpl.render.pt);
});

test("buildSentence is deterministic under a fixed rng", () => {
  const tpl = tplById("I_EAT_FOOD");
  for (const lc of ["en", "pt", "fr", "de", "ja", "tr"]) {
    assert.equal(buildSentence(lc, tpl), buildSentence(lc, tpl), lc);
  }
});

test("getVerbForm conjugates by the subject's person and number", () => {
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_SINGULAR", "pt"), "como");
  assert.equal(getVerbForm("EAT", "HE", "pt"), "come");
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_PLURAL", "pt"), "comemos");
  assert.equal(getVerbForm("EAT", "HE", "en"), "eats");
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_SINGULAR", "en"), "eat");
});

test("Portuguese você takes third-person agreement", () => {
  assert.equal(getVerbForm("EAT", "SECOND_PERSON", "pt"), "come");
});

test("word order: SOV languages put the verb last", () => {
  const tpl = tplById("I_EAT_FOOD");
  assert.deepEqual(orderedConceptsForTemplate(tpl, "en"), [
    "FIRST_PERSON_SINGULAR", "EAT", "FOOD",
  ]);
  for (const sov of ["ja", "tr"]) {
    const ordered = orderedConceptsForTemplate(tpl, sov);
    assert.equal(ordered[ordered.length - 1], "EAT", `${sov} is verb-final`);
  }
});

test("French elision contracts vowel collisions", () => {
  assert.equal(frenchElision("je aime le eau"), "j'aime l'eau");
});

test("English indefinite article picks a/an", () => {
  assert.equal(englishIndefiniteArticle("apple"), "an");
  assert.equal(englishIndefiniteArticle("book"), "a");
});

test("pluralize handles regular and irregular nouns", () => {
  assert.equal(pluralize("box"), "boxes");
  assert.equal(pluralize("city"), "cities");
  assert.equal(pluralize("person"), "people");
  assert.equal(PLURAL_EXCEPTIONS["child"], "children");
});

test("zero-copula languages are uk, ar, tr", () => {
  assert.deepEqual([...ZERO_PRESENT_COPULA].sort(), ["ar", "tr", "uk"]);
});

test("surface forms resolve from vocab data", () => {
  assert.equal(surfaceForm("en", "HE"), "he");
  assert.equal(nounPhrase("en", "FOOD"), "food");
  assert.equal(nounPhrase("fr", "WATER"), "eau");
});

test("character-trait adjectives only pair with beings", () => {
  // User-reported: "You see a brave school" / "Ти бачиш хоробрий школа".
  // BRAVE/STRONG carry property_character and must reject inanimate nouns.
  assert.equal(adjectiveSuitsNoun("BRAVE", "SCHOOL"), false);
  assert.equal(adjectiveSuitsNoun("BRAVE", "POTION"), false);
  assert.equal(adjectiveSuitsNoun("STRONG", "SCHOOL"), false);
  assert.equal(adjectiveSuitsNoun("BRAVE", "FRIEND"), true);
  assert.equal(adjectiveSuitsNoun("BRAVE", "WIZARD"), true);
  assert.equal(adjectiveSuitsNoun("STRONG", "TROLL"), true);
});

test("blankSentence leaves the string unchanged when the surface is absent", () => {
  // The app treats an unchanged (blankless) result as "do not show this
  // exercise" — the L3 no-blank guard depends on this behavior.
  assert.equal(blankSentence("Ворог сильний тому що вона захищає друг.", "хоробрий"),
    "Ворог сильний тому що вона захищає друг.");
  assert.ok(blankSentence("Ти бачиш школу.", "школу").includes("_____"));
});

test("every core template renders a non-empty English sentence", () => {
  const core = templates.filter((t) => t._file === "sentence_templates.json");
  assert.ok(core.length > 100, "core template set is present");
  for (const tpl of core) {
    const s = buildSentence("en", tpl);
    assert.ok(s && s.trim().length > 0, `${tpl.template_id} rendered empty`);
  }
});
