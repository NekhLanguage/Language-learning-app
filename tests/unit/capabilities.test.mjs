// Unit tests for the per-feature × per-language capability registry.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_LANGUAGE_CODES, isFeatureAvailable, availableFeatures } from "../../capabilities.mjs";

test("registry knows all 13 app languages", () => {
  assert.equal(ALL_LANGUAGE_CODES.length, 13);
  assert.ok(ALL_LANGUAGE_CODES.includes("no"));
  assert.ok(ALL_LANGUAGE_CODES.includes("uk"));
});

test("text features are available for every language pair", () => {
  for (const target of ALL_LANGUAGE_CODES) {
    for (const support of ALL_LANGUAGE_CODES) {
      assert.ok(isFeatureAvailable("grammar_notes", { target, support }), `${target}/${support}`);
      assert.ok(isFeatureAvailable("coaching", { target, support }), `${target}/${support}`);
    }
  }
});

test("on-device semantic grading is gated to verified target languages", () => {
  assert.ok(isFeatureAvailable("semantic_grading", { target: "es", support: "en" }));
  // Norwegian target must fall back to strict matching, whatever the support.
  assert.equal(isFeatureAvailable("semantic_grading", { target: "no", support: "en" }), false);
  assert.equal(isFeatureAvailable("semantic_grading", { target: "uk", support: "uk" }), false);
});

test("mnemonics are gated on the support language, not the target", () => {
  assert.ok(isFeatureAvailable("mnemonics", { target: "no", support: "en" }));
  assert.equal(isFeatureAvailable("mnemonics", { target: "no", support: "pt" }), false);
});

test("unknown features are never available", () => {
  assert.equal(isFeatureAvailable("time_travel", { target: "en", support: "en" }), false);
});

test("availableFeatures lists exactly what passes the gates", () => {
  const feats = availableFeatures({ target: "no", support: "en" });
  assert.ok(feats.includes("grammar_notes"));
  assert.ok(feats.includes("speech_practice"));
  assert.ok(feats.includes("mnemonics"));
  assert.ok(!feats.includes("semantic_grading"));
});
