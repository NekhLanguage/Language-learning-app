// Unit tests for on-device semantic grading (grading.mjs), using fake
// Prompt API implementations.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promptApiAvailable, buildGradingPrompt, parseVerdict, gradeSemantically } from "../../grading.mjs";

const INPUT = {
  userInput: "Como pão",
  targetSentence: "Eu como o pão.",
  supportSentence: "I eat the bread.",
  langLabel: "Portuguese",
};

function fakeRoot(promptImpl) {
  return {
    LanguageModel: {
      create: async () => ({ prompt: promptImpl, destroy: () => {} }),
    },
  };
}

test("promptApiAvailable detects the API shape", () => {
  assert.equal(promptApiAvailable({}), false);
  assert.equal(promptApiAvailable({ LanguageModel: {} }), false);
  assert.equal(promptApiAvailable(fakeRoot(async () => "")), true);
});

test("the prompt contains the sentences and language", () => {
  const p = buildGradingPrompt(INPUT);
  assert.ok(p.includes("Eu como o pão."));
  assert.ok(p.includes("Como pão"));
  assert.ok(p.includes("Portuguese"));
  assert.ok(p.includes('"acceptable"'));
});

test("parseVerdict handles clean and wrapped JSON, rejects junk", () => {
  assert.deepEqual(parseVerdict('{"acceptable": true, "feedback": "Nice."}'),
    { acceptable: true, feedback: "Nice." });
  assert.deepEqual(parseVerdict('Sure! {"acceptable": false, "feedback": "Wrong verb."} Hope that helps.'),
    { acceptable: false, feedback: "Wrong verb." });
  assert.equal(parseVerdict("I think it is fine"), null);
  assert.equal(parseVerdict('{"acceptable": "yes"}'), null);
  assert.equal(parseVerdict(42), null);
});

test("gradeSemantically returns the parsed verdict", async () => {
  const root = fakeRoot(async () => '{"acceptable": true, "feedback": "Same meaning."}');
  assert.deepEqual(await gradeSemantically(INPUT, { root }),
    { acceptable: true, feedback: "Same meaning." });
});

test("gradeSemantically returns null when the API is missing", async () => {
  assert.equal(await gradeSemantically(INPUT, { root: {} }), null);
});

test("gradeSemantically returns null on timeout", async () => {
  const root = fakeRoot(() => new Promise(() => {})); // never resolves
  assert.equal(await gradeSemantically(INPUT, { root, timeoutMs: 50 }), null);
});

test("gradeSemantically returns null when the model throws", async () => {
  const root = fakeRoot(async () => { throw new Error("boom"); });
  assert.equal(await gradeSemantically(INPUT, { root }), null);
});
