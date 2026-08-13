// Unit tests for the tutor profile builder: mastery tiering, word rendering,
// and memory formatting.

import test from "node:test";
import assert from "node:assert/strict";
import {
  baseForm,
  tierConcepts,
  buildProfileText,
  buildMemoryText,
} from "../../tutor_profile.mjs";

function fakeRun() {
  return {
    sessionNumber: 4,
    released: ["WATER", "DRINK", "BOOK", "GOOD", "PHONE"],
    progress: {
      WATER: { level: 7, completed: true },
      DRINK: { level: 6, completed: false },
      BOOK: { level: 4, completed: false },
      GOOD: { level: 1, completed: false },
      // PHONE: released but never practiced — no progress entry.
    },
  };
}

const TARGET_FORMS = {
  WATER: { form: "agua" },
  DRINK: { base: "beber", "1_singular": "bebo" },
  BOOK: { form: "livro" },
  GOOD: { form: "bueno" },
  PHONE: { form: "teléfono" },
};

const SUPPORT_FORMS = {
  WATER: { form: "water" },
  DRINK: { base: "drink" },
  BOOK: { form: "book" },
  GOOD: { form: "good" },
  PHONE: { form: "phone" },
};

test("baseForm extracts noun, verb, array, and fallback shapes", () => {
  assert.equal(baseForm({ form: "agua" }, "WATER"), "agua");
  assert.equal(baseForm({ base: "beber" }, "DRINK"), "beber");
  assert.equal(baseForm(["yo", "me"], "FIRST_PERSON_SINGULAR"), "yo");
  assert.equal(baseForm(undefined, "MYSTERY"), "MYSTERY");
});

test("tierConcepts buckets by level, completion, and missing progress", () => {
  const tiers = tierConcepts(fakeRun());
  assert.deepEqual(tiers.production.sort(), ["DRINK", "WATER"]);
  assert.deepEqual(tiers.practicing, ["BOOK"]);
  assert.deepEqual(tiers.seen.sort(), ["GOOD", "PHONE"]);
});

test("tierConcepts only includes released concepts", () => {
  const run = fakeRun();
  run.progress.SECRET = { level: 7, completed: true }; // not released
  const tiers = tierConcepts(run);
  assert.ok(!tiers.production.includes("SECRET"));
});

test("buildProfileText renders tiers with target = support pairs", () => {
  const text = buildProfileText({
    run: fakeRun(),
    targetForms: TARGET_FORMS,
    supportForms: SUPPORT_FORMS,
    targetLabel: "Spanish",
    supportLabel: "English",
    personalVocab: [{ word: "mercado", translation: "market" }],
  });
  assert.match(text, /Learning Spanish \(support language: English\)/);
  assert.match(text, /PRODUCTION VOCABULARY \(2 words/);
  assert.match(text, /agua = water/);
  assert.match(text, /beber = drink/);
  assert.match(text, /PRACTICING \(1 words?/);
  assert.match(text, /livro = book/);
  assert.match(text, /JUST SEEN \(2 words/);
  assert.match(text, /teléfono = phone/);
  assert.match(text, /PERSONAL VOCABULARY \(1 words?/);
  assert.match(text, /mercado = market/);
});

test("buildProfileText survives an empty run", () => {
  const text = buildProfileText({
    run: { released: [], progress: {} },
    targetForms: {},
    supportForms: {},
    targetLabel: "Spanish",
    supportLabel: "English",
    personalVocab: [],
  });
  assert.match(text, /\(none yet\)/);
});

test("buildMemoryText leads with the latest next focus", () => {
  const text = buildMemoryText({
    sessions: [
      {
        when: "2026-08-13",
        sessionSummary: "Practiced food vocabulary.",
        struggles: ["gender agreement"],
        nextFocus: "Drill gender agreement.",
      },
      { when: "2026-08-12", sessionSummary: "First session.", struggles: [], nextFocus: "Greetings." },
    ],
  });
  assert.match(text, /^CURRENT NEXT FOCUS: Drill gender agreement\./);
  assert.match(text, /2026-08-13 — Practiced food vocabulary\. — Struggles: gender agreement/);
  assert.match(text, /2026-08-12 — First session\./);
});

test("buildMemoryText is empty for no sessions", () => {
  assert.equal(buildMemoryText({ sessions: [] }), "");
  assert.equal(buildMemoryText(undefined), "");
});
