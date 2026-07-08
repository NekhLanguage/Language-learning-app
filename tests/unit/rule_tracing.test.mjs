// Unit tests for grammar-rule tracing (buildSentenceWithRules): each build
// reports which grammar phenomena fired, keying the learner-facing "why?"
// explanations.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import {
  configureEngine,
  buildSentence,
  buildSentenceWithRules,
  GRAMMAR_RULE_IDS,
} from "../../sentence_engine.mjs";

let templates;

before(() => {
  const vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999,
  });
});

const tplById = (id) => templates.find((t) => t.template_id === id);

test("tracing never changes the generated sentence", () => {
  for (const tpl of templates.slice(0, 50)) {
    for (const lc of ["en", "pt", "fr", "tr", "ja", "uk", "zh", "ar"]) {
      const plain = buildSentence(lc, tpl);
      const traced = buildSentenceWithRules(lc, tpl);
      assert.equal(traced.sentence, plain, `${tpl.template_id} ${lc}`);
    }
  }
});

test("all reported rules come from the registered id list", () => {
  const known = new Set(GRAMMAR_RULE_IDS);
  for (const tpl of templates.slice(0, 100)) {
    for (const lc of loadLanguageCodes()) {
      for (const rule of buildSentenceWithRules(lc, tpl).rules) {
        assert.ok(known.has(rule), `unregistered rule "${rule}"`);
      }
    }
  }
});

test("verb agreement fires when a verb conjugates", () => {
  const tpl = tplById("I_EAT_FOOD");
  const { rules } = buildSentenceWithRules("pt", tpl);
  assert.ok(rules.includes("verb_agreement"), rules.join(","));
});

test("SOV word order fires for Japanese and Turkish, not English", () => {
  const tpl = tplById("I_EAT_FOOD");
  assert.ok(buildSentenceWithRules("ja", tpl).rules.includes("sov_word_order"));
  assert.ok(buildSentenceWithRules("tr", tpl).rules.includes("sov_word_order"));
  assert.ok(!buildSentenceWithRules("en", tpl).rules.includes("sov_word_order"));
});

test("every language surfaces at least one rule somewhere in the core set", () => {
  // Sanity: the tracer is not silently dead for any language.
  const core = templates.filter((t) => t._file === "sentence_templates.json");
  for (const lc of loadLanguageCodes()) {
    const fired = new Set();
    for (const tpl of core) {
      for (const r of buildSentenceWithRules(lc, tpl).rules) fired.add(r);
    }
    assert.ok(fired.size > 0, `no rules ever fire for ${lc}`);
  }
});

test("rule ids are stable and documented", () => {
  // The content validator keys grammar notes to these exact ids.
  assert.deepEqual(
    [...GRAMMAR_RULE_IDS].sort(),
    [
      "accusative_object",
      "french_elision",
      "french_possessive_agreement",
      "gender_agreement",
      "indefinite_article",
      "ja_counter",
      "post_nominal_adjective",
      "sov_word_order",
      "verb_agreement",
      "vso_word_order",
      "zero_copula",
      "zh_predicate_adjective",
    ]
  );
});
