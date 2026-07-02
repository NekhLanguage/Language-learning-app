// Unit tests for coaching-line resolution (coaching.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { stageForMilestone, coachingMilestoneLine, sessionCompleteLine } from "../../coaching.mjs";

const FIXTURE = {
  milestones: {
    travel: {
      early: { en: "{detail} feels closer — {n} words in." },
      mid: { en: "Halfway conversations about {detail} are coming." },
      late: { en: "{detail} will hear you speak {lang}." },
    },
    generic: {
      early: { en: "{n} words — every one of them yours." },
      mid: { en: "Real sentences now." },
      late: { en: "This is real ability in {lang}." },
    },
  },
  sessionComplete: {
    en: ["Nice work today.", "Session {n} done.", "Consistency wins."],
  },
};

test("milestone counts map to stages", () => {
  assert.equal(stageForMilestone(50), "early");
  assert.equal(stageForMilestone(100), "early");
  assert.equal(stageForMilestone(150), "mid");
  assert.equal(stageForMilestone(200), "mid");
  assert.equal(stageForMilestone(250), "late");
  assert.equal(stageForMilestone(300), "late");
});

test("resolves the reason line with placeholders filled", () => {
  const line = coachingMilestoneLine(FIXTURE, {
    type: "travel", detail: "Japan", n: 50, supportLang: "en", langName: "Japanese",
  });
  assert.equal(line, "Japan feels closer — 50 words in.");
});

test("falls back to generic when the learner gave no detail", () => {
  const line = coachingMilestoneLine(FIXTURE, {
    type: "travel", detail: "", n: 50, supportLang: "en", langName: "Japanese",
  });
  assert.equal(line, "50 words — every one of them yours.");
});

test("falls back to generic for unknown reason types", () => {
  const line = coachingMilestoneLine(FIXTURE, {
    type: "mystery", detail: "x", n: 250, supportLang: "en", langName: "Greek",
  });
  assert.equal(line, "This is real ability in Greek.");
});

test("returns null when the language is missing entirely", () => {
  const line = coachingMilestoneLine(FIXTURE, {
    type: "travel", detail: "Japan", n: 50, supportLang: "uk", langName: "японська",
  });
  assert.equal(line, null);
});

test("session lines rotate by session number and fill {n}", () => {
  assert.equal(sessionCompleteLine(FIXTURE, 1, "en"), "Nice work today.");
  assert.equal(sessionCompleteLine(FIXTURE, 2, "en"), "Session 2 done.");
  assert.equal(sessionCompleteLine(FIXTURE, 3, "en"), "Consistency wins.");
  assert.equal(sessionCompleteLine(FIXTURE, 4, "en"), "Nice work today."); // wraps
  assert.equal(sessionCompleteLine(FIXTURE, 1, "uk"), null);
});
