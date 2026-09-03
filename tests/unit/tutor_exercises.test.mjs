import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tutorProductionTask,
  tutorExampleTiles,
  gradeTyped,
  liftTutorLevel,
} from "../../tutor_exercises.mjs";

test("tutorProductionTask: banked example sentence drives sentence mode", () => {
  const task = tutorProductionTask({
    word: "beurre", translation: "butter",
    exampleSentence: "Je mange du beurre.", exampleTranslation: "I eat butter.",
  });
  assert.deepEqual(task, { mode: "sentence", prompt: "I eat butter.", answer: "Je mange du beurre." });
});

test("tutorProductionTask: no banked sentence falls back to the word", () => {
  const task = tutorProductionTask({ word: "корисний", translation: "useful", exampleSentence: "", exampleTranslation: "" });
  assert.deepEqual(task, { mode: "word", prompt: "useful", answer: "корисний" });
  // A sentence without its translation is unusable as a prompt.
  const half = tutorProductionTask({ word: "x", translation: "y", exampleSentence: "x y z" });
  assert.equal(half.mode, "word");
});

test("tutorExampleTiles: whitespace tokens, edge punctuation stripped, lowercased", () => {
  assert.deepEqual(tutorExampleTiles("Je mange du beurre."), ["je", "mange", "du", "beurre"]);
  assert.deepEqual(tutorExampleTiles("«Чому ти тут?»"), ["чому", "ти", "тут"]);
  // Inner apostrophes survive (l'eau), only edges are trimmed.
  assert.deepEqual(tutorExampleTiles("J'aime l'eau!"), ["j'aime", "l'eau"]);
});

test("tutorExampleTiles: spaceless scripts and one-word examples give no tiles", () => {
  assert.deepEqual(tutorExampleTiles("私は火が好きです。"), []);
  assert.deepEqual(tutorExampleTiles("Beurre."), []);
  assert.deepEqual(tutorExampleTiles(""), []);
});

test("gradeTyped: exact, accent-loose, wrong, empty", () => {
  assert.equal(gradeTyped("je mange du beurre", "Je mange du beurre."), "perfect");
  assert.equal(gradeTyped("Je mange du beurre!", "Je mange du beurre."), "perfect");
  assert.equal(gradeTyped("cafe", "café"), "accent");
  assert.equal(gradeTyped("Je bois du café", "Je mange du beurre."), "incorrect");
  assert.equal(gradeTyped("   ", "café"), "incorrect");
});

test("liftTutorLevel: 3 and 4 lift to 5, everything else stays", () => {
  const p3 = { level: 3 }; assert.equal(liftTutorLevel(p3), true); assert.equal(p3.level, 5);
  const p4 = { level: 4 }; assert.equal(liftTutorLevel(p4), true); assert.equal(p4.level, 5);
  for (const l of [1, 2, 5, 6, 7]) {
    const p = { level: l }; assert.equal(liftTutorLevel(p), false); assert.equal(p.level, l);
  }
  assert.equal(liftTutorLevel(null), false);
});
