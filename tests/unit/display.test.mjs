// Unit tests for support-sentence display policy (display.mjs) and the
// engine's hadModifier signal it depends on.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { chooseSupportSentence } from "../../display.mjs";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import { configureEngine, buildSentenceWithRules } from "../../sentence_engine.mjs";

const TPL = {
  template_id: "T",
  concepts: ["FIRST_PERSON_SINGULAR", "EAT", "FOOD"],
  render: { en: "I eat food.", pt: "Eu como comida." },
};

test("prefers the authored translation for plain sentences", () => {
  const out = chooseSupportSentence(TPL, "pt", { generated: "eu como comida GERADO", hadModifier: false });
  assert.deepEqual(out, { sentence: "Eu como comida.", source: "authored" });
});

test("falls back to the generated sentence when a modifier was injected", () => {
  const out = chooseSupportSentence(TPL, "pt", { generated: "Eu como comida quente.", hadModifier: true });
  assert.deepEqual(out, { sentence: "Eu como comida quente.", source: "generated" });
});

test("falls back when no authored render exists for the language", () => {
  const out = chooseSupportSentence(TPL, "uk", { generated: "Я їм їжу.", hadModifier: false });
  assert.deepEqual(out, { sentence: "Я їм їжу.", source: "generated" });
});

// --- engine hadModifier signal ---

let templates;
before(() => {
  const vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999, // suppresses random injection
  });
});

test("hadModifier is false when injection is suppressed", () => {
  const tpl = templates.find((t) => t.template_id === "I_EAT_FOOD");
  for (const lc of ["en", "pt", "fr"]) {
    assert.equal(buildSentenceWithRules(lc, tpl).hadModifier, false, lc);
  }
});

test("hadModifier is true when a modifier lands in the sentence", () => {
  // rng low enough to trigger adjective injection (< 0.75) wherever a
  // compatible released adjective exists. Scan templates until one build
  // actually differs from its plain render — that build must be flagged.
  const vocab = loadVocab(loadLanguageCodes());
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.2,
  });

  let flagged = 0;
  let divergedButUnflagged = [];
  for (const tpl of templates.slice(0, 200)) {
    const injected = buildSentenceWithRules("en", tpl);
    // Re-render plain for comparison.
    configureEngine({ rng: () => 0.999 });
    const plain = buildSentenceWithRules("en", tpl);
    configureEngine({ rng: () => 0.2 });

    if (injected.sentence !== plain.sentence) {
      if (injected.hadModifier) flagged++;
      else divergedButUnflagged.push(tpl.template_id);
    }
  }

  // restore suppressed rng for any later tests
  configureEngine({ rng: () => 0.999 });

  assert.ok(flagged > 0, "expected at least one injected build in 200 templates");
  assert.deepEqual(divergedButUnflagged, [], "every diverging build must be flagged");
});
