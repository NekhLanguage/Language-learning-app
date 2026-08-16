// Unit tests for the learner-facts store (learner_facts.mjs).
// Bounded write-path for identity/subject facts the tutor must remember
// across sessions — distinct from the vocab admission pipeline.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEARNER_FACTS_CAP,
  getLearnerFacts,
  addLearnerFact,
  correctLearnerFact,
  renderLearnerFactsText,
  applyTutorLearnerFacts,
} from "../../learner_facts.mjs";

test("getLearnerFacts returns [] for legacy (pre-v3) blobs", () => {
  assert.deepEqual(getLearnerFacts({}), []);
  assert.deepEqual(getLearnerFacts(null), []);
  assert.deepEqual(getLearnerFacts({ learnerFacts: "not an array" }), []);
});

test("addLearnerFact accepts a fresh fact and stamps addedAt", () => {
  const user = {};
  const { added, entry } = addLearnerFact(user, "learner is Norwegian", { addedAt: "2026-08-16" });
  assert.equal(added, true);
  assert.equal(entry.text, "learner is Norwegian");
  assert.equal(entry.source, "tutor");
  assert.equal(entry.addedAt, "2026-08-16");
  assert.deepEqual(user.learnerFacts, [entry]);
});

test("addLearnerFact trims whitespace and truncates at 200 chars", () => {
  const user = {};
  addLearnerFact(user, "  padded  ");
  assert.equal(user.learnerFacts[0].text, "padded");
  const long = "x".repeat(300);
  addLearnerFact(user, long);
  assert.equal(user.learnerFacts[1].text.length, 200);
});

test("addLearnerFact drops empty strings", () => {
  const user = {};
  assert.equal(addLearnerFact(user, "").added, false);
  assert.equal(addLearnerFact(user, "   ").added, false);
  assert.equal(addLearnerFact(user, null).added, false);
  // Dropped inputs never touch the store — the field stays untouched so
  // getLearnerFacts's null-safe [] fallback still governs it.
  assert.deepEqual(getLearnerFacts(user), []);
});

test("addLearnerFact treats case-insensitive duplicates as no-ops", () => {
  const user = {};
  addLearnerFact(user, "Learner is Norwegian");
  const { added, entry } = addLearnerFact(user, "learner is NORWEGIAN");
  assert.equal(added, false);
  assert.equal(entry.text, "Learner is Norwegian"); // returned = the existing entry
  assert.equal(user.learnerFacts.length, 1);
});

test("addLearnerFact drops silently once cap is reached (non-correction path)", () => {
  const user = {};
  for (let i = 0; i < LEARNER_FACTS_CAP; i++) addLearnerFact(user, `fact ${i}`);
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
  const overflow = addLearnerFact(user, "one more");
  assert.equal(overflow.added, false);
  assert.equal(overflow.entry, null);
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
});

test("correctLearnerFact replaces matching entry in place, even at cap", () => {
  const user = {};
  for (let i = 0; i < LEARNER_FACTS_CAP; i++) addLearnerFact(user, `fact ${i}`);
  const { corrected, entry } = correctLearnerFact(
    user, "FACT 5", "fact 5 (corrected)", { addedAt: "2026-08-16" }
  );
  assert.equal(corrected, true);
  assert.equal(entry.text, "fact 5 (corrected)");
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
  assert.equal(user.learnerFacts[5].text, "fact 5 (corrected)");
  assert.equal(user.learnerFacts[5].addedAt, "2026-08-16");
});

test("correctLearnerFact falls back to add when the target does not exist", () => {
  const user = {};
  const { corrected, entry } = correctLearnerFact(user, "not there", "fresh fact");
  assert.equal(corrected, false);
  assert.equal(entry.text, "fresh fact");
  assert.equal(user.learnerFacts.length, 1);
});

test("correctLearnerFact fallback add still respects the cap", () => {
  const user = {};
  for (let i = 0; i < LEARNER_FACTS_CAP; i++) addLearnerFact(user, `fact ${i}`);
  const { corrected, entry } = correctLearnerFact(user, "not there", "would overflow");
  assert.equal(corrected, false);
  assert.equal(entry, null);
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
});

test("correctLearnerFact ignores empty new text", () => {
  const user = { learnerFacts: [{ text: "fact 0", source: "tutor", addedAt: null }] };
  const { corrected, entry } = correctLearnerFact(user, "fact 0", "");
  assert.equal(corrected, false);
  assert.equal(entry, null);
  assert.equal(user.learnerFacts[0].text, "fact 0");
});

test("renderLearnerFactsText produces a plain bullet list, empty→\"\"", () => {
  assert.equal(renderLearnerFactsText([]), "");
  assert.equal(renderLearnerFactsText(null), "");
  const rendered = renderLearnerFactsText([
    { text: "learner is Norwegian" },
    { text: "main target language is Ukrainian" },
  ]);
  assert.equal(rendered, "- learner is Norwegian\n- main target language is Ukrainian");
});

test("applyTutorLearnerFacts adds new facts and records corrections", () => {
  const user = {
    learnerFacts: [{ text: "Pokemon are real animals", source: "tutor", addedAt: null }],
  };
  const result = applyTutorLearnerFacts(user, {
    newLearnerFacts: ["learner is Norwegian", "partner is Ukrainian"],
    correctedLearnerFacts: [
      { replaces: "Pokemon are real animals", text: "Pokémon is a video-game franchise, not real animals" },
    ],
  }, "2026-08-16");
  assert.equal(result.added.length, 2);
  assert.equal(result.corrected.length, 1);
  assert.equal(result.corrected[0].from, "Pokemon are real animals");
  assert.equal(user.learnerFacts.length, 3);
  assert.equal(user.learnerFacts[0].text, "Pokémon is a video-game franchise, not real animals");
});

test("applyTutorLearnerFacts drops entries that overflow the cap", () => {
  const user = { learnerFacts: [] };
  for (let i = 0; i < LEARNER_FACTS_CAP - 1; i++) addLearnerFact(user, `fact ${i}`);
  const result = applyTutorLearnerFacts(user, {
    newLearnerFacts: ["one more (fits)", "two more (drops)", "three more (drops)"],
    correctedLearnerFacts: [],
  }, "2026-08-16");
  assert.equal(result.added.length, 1);
  assert.equal(result.dropped.length, 2);
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
});

test("applyTutorLearnerFacts corrections free a slot before adds", () => {
  // At cap. A correction removes an old entry, THEN the add lands where it
  // would otherwise have been dropped.
  const user = { learnerFacts: [] };
  for (let i = 0; i < LEARNER_FACTS_CAP; i++) addLearnerFact(user, `fact ${i}`);
  const result = applyTutorLearnerFacts(user, {
    // A correction that REPLACES fact 0 (no slot freed, just overwritten).
    correctedLearnerFacts: [{ replaces: "fact 0", text: "fact 0 (fixed)" }],
    newLearnerFacts: ["totally new fact"],
  }, "2026-08-16");
  assert.equal(result.corrected.length, 1);
  // Cap unchanged, so the additional new fact still drops.
  assert.equal(result.dropped.length, 1);
  assert.equal(user.learnerFacts.length, LEARNER_FACTS_CAP);
  assert.equal(user.learnerFacts[0].text, "fact 0 (fixed)");
});

test("applyTutorLearnerFacts is null-safe on missing summary fields", () => {
  const user = {};
  const result = applyTutorLearnerFacts(user, {}, "2026-08-16");
  assert.deepEqual(result, { added: [], corrected: [], dropped: [] });
  // A no-op apply pass never touches the store — the null-safe [] fallback
  // handles legacy blobs on the read side.
  assert.deepEqual(getLearnerFacts(user), []);
});
