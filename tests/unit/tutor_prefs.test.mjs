// Anna's preference rendering (netlify/functions/tutor.js). Nekh 2026-09-13:
// the dials and the free-text instructions "aren't really considered
// enough" — they trailed the 20k-char profile as one line of JSON. They now
// render as explicit rules ahead of the profile and are restated per turn.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { contextBlock, renderPreferences, steeringTrailer } = require("../../netlify/functions/tutor.js");

test("renderPreferences spells out each chosen dial and the learner's instructions", () => {
  const text = renderPreferences({
    correctionDepth: "deep",
    challenge: "push",
    languageMix: "immersion",
    note: "Push me hard on verb endings.\nNever switch to English.",
  });
  assert.match(text, /Corrections: deep — .*name the rule/);
  assert.match(text, /Challenge: push — .*do not simplify/);
  assert.match(text, /Language mix: immersion — target language only/);
  assert.match(text, /LEARNER'S OWN INSTRUCTIONS/);
  assert.ok(text.includes("Push me hard on verb endings.\nNever switch to English."));
  // Never rendered as raw JSON any more.
  assert.ok(!text.includes("{"));
});

test("renderPreferences falls back to defaults on missing or unknown values", () => {
  const text = renderPreferences({ correctionDepth: "brutal", challenge: null, note: "   " });
  assert.match(text, /Corrections: medium/);
  assert.match(text, /Challenge: stretch/);
  assert.match(text, /Language mix: balanced/);
  assert.match(text, /\(none given\)/);
  assert.equal(renderPreferences(undefined), renderPreferences({}));
});

test("renderPreferences caps the learner's instructions at 1000 characters", () => {
  const text = renderPreferences({ note: "x".repeat(5000) });
  assert.ok(text.includes("x".repeat(1000)));
  assert.ok(!text.includes("x".repeat(1001)));
});

test("contextBlock places preferences and instructions before the profile", () => {
  const block = contextBlock({
    targetLang: "Norwegian",
    supportLang: "English",
    profile: "LEVEL TIER: ABSOLUTE BEGINNER",
    preferences: { note: "Keep it about football." },
    memory: "",
    learnerFacts: "- learner is Norwegian",
  });
  const at = (s) => block.indexOf(s);
  assert.ok(at("=== LEARNER FACTS") < at("=== PREFERENCES"));
  assert.ok(at("=== PREFERENCES") < at("=== LEARNER'S OWN INSTRUCTIONS"));
  assert.ok(at("=== LEARNER'S OWN INSTRUCTIONS") < at("=== LEARNER PROFILE"));
  assert.ok(at("=== LEARNER PROFILE") < at("=== MEMORY"));
  assert.ok(block.includes("Keep it about football."));
});

test("steeringTrailer restates dials and instructions and is marked as app-authored", () => {
  const trailer = steeringTrailer({ challenge: "push", languageMix: "immersion", note: "Be strict." });
  assert.ok(trailer.startsWith("\n\n[App reminder"));
  assert.ok(trailer.endsWith("]"));
  assert.match(trailer, /not written by the learner/);
  assert.match(trailer, /corrections=medium, challenge=push, language mix=immersion/);
  assert.ok(trailer.includes('"Be strict."'));
  // No note → no instructions clause, dials still restated.
  const bare = steeringTrailer({});
  assert.ok(!/own instructions/.test(bare));
  assert.match(bare, /challenge=stretch/);
});
