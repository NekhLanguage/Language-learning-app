// Unit tests for the tutor→app vocabulary admission pipeline:
// sighting counting, promotion, threshold-3 admission, per-session cap,
// collision guard, and the ladder-apply step.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMISSION_THRESHOLD,
  MAX_ADMISSIONS_PER_SESSION,
  tutorCid,
  wordUsedInText,
  processTutorSession,
  applyAdmissions,
} from "../../tutor_admission.mjs";

const entry = (word, dates, extra = {}) => ({
  word,
  translation: `${word}-en`,
  note: "",
  pos: "noun",
  seenInSessions: dates,
  admittedAt: null,
  ...extra,
});

const freshRun = (over = {}) => ({
  released: ["WATER"],
  progress: { WATER: { level: 3, streak: 1, completed: false, lastShownAt: 1, lastResult: true, provenance: "pack", admittedFrom: null } },
  personalVocab: [],
  pendingAdmission: [],
  ...over,
});

test("policy constants match Nekh's locked answers", () => {
  assert.equal(ADMISSION_THRESHOLD, 3);
  assert.equal(MAX_ADMISSIONS_PER_SESSION, 10);
});

test("tutorCid slugs across scripts and strips punctuation", () => {
  assert.equal(tutorCid("fireball"), "TUTOR_FIREBALL");
  assert.equal(tutorCid("apprendre!"), "TUTOR_APPRENDRE");
  assert.equal(tutorCid("вода"), "TUTOR_ВОДА");
  assert.equal(tutorCid("寿司"), "TUTOR_寿司");
  assert.equal(tutorCid("l'été"), "TUTOR_LÉTÉ");
});

test("wordUsedInText: word boundaries for spaced scripts, substring for CJK", () => {
  assert.equal(wordUsedInText("chat", "Le chat dort."), true);
  assert.equal(wordUsedInText("chat", "Nous chantons."), false); // embedded
  assert.equal(wordUsedInText("Praia", "vamos à praia amanhã"), true); // case-insensitive
  assert.equal(wordUsedInText("寿司", "今日は寿司を食べます"), true);
  assert.equal(wordUsedInText("вода", "де вода зараз"), true);
  assert.equal(wordUsedInText("вода", "водаспад"), false);
  assert.equal(wordUsedInText("", "anything"), false);
});

test("session 1 captures a new word with one sighting", () => {
  const run = freshRun();
  const { admitted } = processTutorSession(run, [{ word: "praia", translation: "beach", note: "", pos: "noun" }], "", "2026-08-15", () => false);
  assert.equal(admitted.length, 0);
  assert.equal(run.personalVocab.length, 1);
  assert.deepEqual(run.personalVocab[0].seenInSessions, ["2026-08-15"]);
});

test("first-sighting captures exampleSentence + exampleTranslation onto personalVocab", () => {
  const run = freshRun();
  processTutorSession(
    run,
    [{ word: "praia", translation: "beach", note: "", pos: "noun",
       exampleSentence: "Vamos à praia amanhã.", exampleTranslation: "Let's go to the beach tomorrow." }],
    "", "2026-08-15", () => false,
  );
  assert.equal(run.personalVocab[0].exampleSentence, "Vamos à praia amanhã.");
  assert.equal(run.personalVocab[0].exampleTranslation, "Let's go to the beach tomorrow.");
});

test("first-sighting without example fields defaults to empty strings (backward compatible)", () => {
  const run = freshRun();
  processTutorSession(
    run,
    [{ word: "praia", translation: "beach", note: "", pos: "noun" }],
    "", "2026-08-15", () => false,
  );
  assert.equal(run.personalVocab[0].exampleSentence, "");
  assert.equal(run.personalVocab[0].exampleTranslation, "");
});

test("second distinct-day sighting promotes to pendingAdmission", () => {
  const run = freshRun({ personalVocab: [entry("praia", ["2026-08-13"])] });
  processTutorSession(run, [{ word: "praia" }], "", "2026-08-15", () => false);
  assert.equal(run.personalVocab.length, 0);
  assert.equal(run.pendingAdmission.length, 1);
  assert.deepEqual(run.pendingAdmission[0].seenInSessions, ["2026-08-13", "2026-08-15"]);
});

test("same-day repeat does not double-count (threshold counts distinct days)", () => {
  const run = freshRun({ personalVocab: [entry("praia", ["2026-08-15"])] });
  processTutorSession(run, [{ word: "praia" }], "a praia é linda", "2026-08-15", () => false);
  assert.equal(run.personalVocab.length, 1); // no promotion
  assert.deepEqual(run.personalVocab[0].seenInSessions, ["2026-08-15"]);
});

test("tutor re-using a held word in its replies counts as a sighting", () => {
  const run = freshRun({ personalVocab: [entry("praia", ["2026-08-13"])] });
  processTutorSession(run, [], "Vamos falar da praia hoje!", "2026-08-15", () => false);
  assert.equal(run.pendingAdmission.length, 1);
});

test("third distinct-day sighting admits", () => {
  const run = freshRun({ pendingAdmission: [entry("praia", ["2026-08-11", "2026-08-13"])] });
  const { admitted } = processTutorSession(run, [{ word: "praia" }], "", "2026-08-15", () => false);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].word, "praia");
  assert.equal(run.pendingAdmission.length, 0); // drained
});

test("cap 10 per session with oldest-first-sighting seniority", () => {
  const pending = [];
  for (let i = 0; i < 12; i++) {
    // word12 is oldest (day 01), word1 newest (day 12)
    const day = String(12 - i).padStart(2, "0");
    pending.push(entry(`word${i + 1}`, [`2026-08-${day}`, "2026-08-13", "2026-08-14"]));
  }
  const run = freshRun({ pendingAdmission: pending });
  const { admitted } = processTutorSession(run, [], "", "2026-08-15", () => false);
  assert.equal(admitted.length, MAX_ADMISSIONS_PER_SESSION);
  // The two newest first-sightings (word1 at day 12, word2 at day 11) wait.
  const waiting = run.pendingAdmission.map((e) => e.word).sort();
  assert.deepEqual(waiting, ["word1", "word2"]);
});

test("cid collision skips admission and drains the entry (log-only)", () => {
  const run = freshRun({ pendingAdmission: [entry("water", ["2026-08-11", "2026-08-13", "2026-08-14"])] });
  const { admitted, collided } = processTutorSession(run, [], "", "2026-08-15", (cid) => cid === "TUTOR_WATER");
  assert.equal(admitted.length, 0);
  assert.equal(collided.length, 1);
  assert.equal(run.pendingAdmission.length, 0); // never retries forever
});

test("applyAdmissions puts the concept on the ladder with tutor provenance", () => {
  const run = freshRun();
  const admittedEntry = entry("praia", ["2026-08-11", "2026-08-13", "2026-08-15"]);
  const applied = applyAdmissions(run, [admittedEntry], "2026-08-15");
  assert.deepEqual(applied.map((a) => a.cid), ["TUTOR_PRAIA"]);
  assert.equal(applied[0].sessionsSeen, 3);
  assert.ok(run.released.includes("TUTOR_PRAIA"));
  const p = run.progress.TUTOR_PRAIA;
  assert.equal(p.level, 1);
  assert.equal(p.provenance, "tutor");
  assert.deepEqual(p.admittedFrom, { mode: "tutor", sessionDate: "2026-08-15" });
  assert.deepEqual(run.tutorVocab.TUTOR_PRAIA, {
    word: "praia", translation: "praia-en", note: "", pos: "noun",
    exampleSentence: "", exampleTranslation: "",
  });
  assert.equal(admittedEntry.admittedAt, "2026-08-15");
  // Idempotent across devices: applying again is a no-op.
  assert.deepEqual(applyAdmissions(run, [admittedEntry], "2026-08-16"), []);
  assert.equal(run.released.filter((c) => c === "TUTOR_PRAIA").length, 1);
});

test("applyAdmissions carries banked example sentence into tutorVocab", () => {
  const run = freshRun();
  const admittedEntry = {
    ...entry("praia", ["2026-08-11", "2026-08-13", "2026-08-15"]),
    exampleSentence: "Vamos à praia amanhã.",
    exampleTranslation: "Let's go to the beach tomorrow.",
  };
  applyAdmissions(run, [admittedEntry], "2026-08-15");
  assert.equal(run.tutorVocab.TUTOR_PRAIA.exampleSentence, "Vamos à praia amanhã.");
  assert.equal(run.tutorVocab.TUTOR_PRAIA.exampleTranslation, "Let's go to the beach tomorrow.");
});

test("capture respects the 200-entry personalVocab cap", () => {
  const run = freshRun({
    personalVocab: Array.from({ length: 200 }, (_, i) => entry(`w${i}`, ["2026-08-01"])),
  });
  processTutorSession(run, [{ word: "overflow" }], "", "2026-08-15", () => false);
  assert.equal(run.personalVocab.some((e) => e.word === "overflow"), false);
});
