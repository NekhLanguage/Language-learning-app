// Unit tests for the tutor profile builder: mastery tiering, word rendering,
// and memory formatting.

import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PROFILE_CHARS,
  baseForm,
  tierConcepts,
  levelTier,
  buildProfileText,
  buildMemoryText,
  pickTutorRun,
  mergePersonalVocab,
  wordCountLabel,
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

test("levelTier maps production+practicing counts to tiers", () => {
  const mk = (n) => ({ production: Array(n).fill("X"), practicing: [], seen: [] });
  assert.equal(levelTier(mk(0)).key, "ABSOLUTE BEGINNER");
  assert.equal(levelTier(mk(49)).key, "ABSOLUTE BEGINNER");
  assert.equal(levelTier(mk(50)).key, "EARLY LEARNER");
  assert.equal(levelTier(mk(149)).key, "EARLY LEARNER");
  assert.equal(levelTier(mk(150)).key, "DEVELOPING");
  assert.equal(levelTier(mk(3)).known, 3);
});

test("buildProfileText leads with the computed level tier", () => {
  const text = buildProfileText({
    run: fakeRun(),
    targetForms: TARGET_FORMS,
    supportForms: SUPPORT_FORMS,
    targetLabel: "Spanish",
    supportLabel: "English",
    personalVocab: [],
  });
  assert.match(text, /^LEVEL TIER \(computed by the app — do not re-estimate\): ABSOLUTE BEGINNER \(3 production\+practicing words\)/);
});

test("buildProfileText renders production as target-only and the other tiers as target = support pairs", () => {
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
  assert.match(text, /NEVER gloss, translate or explain them\):\nagua, beber\n/);
  assert.doesNotMatch(text, /agua = water/);
  assert.doesNotMatch(text, /beber = drink/);
  assert.match(text, /PRACTICING \(1 words?/);
  assert.match(text, /livro = book/);
  assert.match(text, /JUST SEEN \(2 words/);
  assert.match(text, /teléfono = phone/);
  assert.match(text, /PERSONAL VOCABULARY \(1 words?/);
  assert.match(text, /mercado = market \(0\/3\)/);
});

test("buildProfileText bounds tiers by recency once they exceed the cap", () => {
  // 300 practicing concepts; cap for practicing is 250. Concept N carries
  // lastShownAt = N so the top-250 are p50..p299 (in that order).
  const released = [];
  const progress = {};
  const targetForms = {};
  const supportForms = {};
  for (let i = 0; i < 300; i++) {
    const cid = `PRAC${i}`;
    released.push(cid);
    progress[cid] = { level: 4, completed: false, lastShownAt: i };
    targetForms[cid] = { form: `t${i}` };
    supportForms[cid] = { form: `s${i}` };
  }
  const text = buildProfileText({
    run: { released, progress },
    targetForms, supportForms,
    targetLabel: "Spanish", supportLabel: "English",
    personalVocab: [],
  });
  assert.match(text, /PRACTICING \(300 words, showing 250 most-recent/);
  assert.match(text, /\(and 50 more not shown\)/);
  // Newest (PRAC299) is shown, oldest (PRAC0) is trimmed.
  assert.match(text, /t299 = s299/);
  assert.equal(text.includes("t0 = s0,"), false);
  // Under-cap tiers keep the plain header shape.
  assert.match(text, /PRODUCTION VOCABULARY \(0 words —/);
});

test("buildProfileText bounds personal vocab by latest sighting once past cap", () => {
  // 70 personal entries; cap is 60. Entry N carries a session date encoding N
  // so the top-60 are the higher-N entries.
  const personalVocab = [];
  for (let i = 0; i < 70; i++) {
    const dd = String((i % 28) + 1).padStart(2, "0");
    const mm = i < 28 ? "06" : i < 56 ? "07" : "08";
    personalVocab.push({ word: `w${i}`, translation: `t${i}`, seenInSessions: [`2026-${mm}-${dd}`] });
  }
  const text = buildProfileText({
    run: { released: [], progress: {} },
    targetForms: {}, supportForms: {},
    targetLabel: "Spanish", supportLabel: "English",
    personalVocab,
  });
  assert.match(text, /PERSONAL VOCABULARY \(70 words, showing 60 most-recent/);
  assert.match(text, /\(and 10 more not shown\)/);
  assert.match(text, /w69 = t69 \(1\/3\)/); // newest survives
  assert.equal(text.includes("w0 = t0 "), false); // oldest trimmed
});

test("buildProfileText leaves under-cap tiers unlabelled as truncated", () => {
  // Same fixture as the vanilla render test — verifies no regression on the
  // "no truncation" header shape.
  const text = buildProfileText({
    run: fakeRun(),
    targetForms: TARGET_FORMS,
    supportForms: SUPPORT_FORMS,
    targetLabel: "Spanish",
    supportLabel: "English",
    personalVocab: [{ word: "mercado", translation: "market" }],
  });
  assert.equal(text.includes("most-recent"), false);
  assert.equal(text.includes("not shown"), false);
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

const RUN_PT = { released: ["A", "B", "C"], progress: {} };
const RUN_ES = { released: ["A"], progress: {} };

test("pickTutorRun follows a valid lastActiveLanguage pointer", () => {
  const pick = pickTutorRun({ lastActiveLanguage: "es", runs: { pt: RUN_PT, es: RUN_ES } });
  assert.equal(pick.targetLang, "es");
  assert.equal(pick.run, RUN_ES);
});

test("pickTutorRun auto-selects a sole run when the pointer is null", () => {
  const pick = pickTutorRun({ lastActiveLanguage: null, runs: { pt: RUN_PT } });
  assert.equal(pick.targetLang, "pt");
  assert.equal(pick.run, RUN_PT);
});

test("pickTutorRun returns candidates (most progress first) when several runs and no pointer", () => {
  const pick = pickTutorRun({ lastActiveLanguage: null, runs: { es: RUN_ES, pt: RUN_PT } });
  assert.equal(pick.targetLang, null);
  assert.equal(pick.run, null);
  assert.deepEqual(pick.candidates.map((c) => c.lang), ["pt", "es"]);
});

test("pickTutorRun ignores a pointer to a non-existent run", () => {
  const pick = pickTutorRun({ lastActiveLanguage: "uk", runs: { pt: RUN_PT } });
  assert.equal(pick.targetLang, "pt"); // falls through to the sole-run rule
});

test("pickTutorRun handles no runs and malformed users", () => {
  assert.deepEqual(pickTutorRun({ runs: {} }).candidates, []);
  assert.equal(pickTutorRun({}).run, null);
  assert.equal(pickTutorRun(null).run, null);
  // Non-object run values are not candidates.
  assert.deepEqual(pickTutorRun({ runs: { pt: 7 } }).candidates, []);
});

test("mergePersonalVocab pulls legacy entries into the run list, normalized to v2 shape", () => {
  const run = [{ word: "praia", translation: "beach", note: "", pos: "noun", seenInSessions: ["2026-08-01"], admittedAt: null }];
  const legacy = [
    { word: "mercado", translation: "market", note: "dev" },
    { word: "Praia", translation: "dupe — run entry wins" },
  ];
  const { vocab, added } = mergePersonalVocab(run, legacy, 200);
  assert.equal(added, 1);
  assert.equal(vocab.length, 2);
  // Run entry untouched, legacy entry normalized.
  assert.equal(vocab[0].translation, "beach");
  assert.deepEqual(vocab[1], {
    word: "mercado", translation: "market", note: "dev",
    pos: "noun", seenInSessions: [], admittedAt: null,
  });
  // Input array not mutated.
  assert.equal(run.length, 1);
});

test("mergePersonalVocab respects the cap and is null-safe", () => {
  const { vocab, added } = mergePersonalVocab(
    [{ word: "a" }],
    [{ word: "b" }, { word: "c" }, null, { noWord: true }],
    2
  );
  assert.equal(added, 1);
  assert.deepEqual(vocab.map((w) => w.word), ["a", "b"]);
  assert.deepEqual(mergePersonalVocab(null, null, 10), { vocab: [], added: 0 });
});

test("mergePersonalVocab with nothing to add reports added: 0", () => {
  const run = [{ word: "praia" }];
  const { added } = mergePersonalVocab(run, [{ word: "PRAIA" }], 200);
  assert.equal(added, 0);
});

test("wordCountLabel splits pack and tutor-admitted counts", () => {
  const run = {
    released: ["WATER", "HOUSE", "TUTOR_PRAIA"],
    progress: {
      WATER: { provenance: "pack" },
      HOUSE: { provenance: "pack" },
      TUTOR_PRAIA: { provenance: "tutor" },
    },
  };
  assert.equal(wordCountLabel(run), "2 + 1");
});

test("wordCountLabel is plain when the tutor holds no words, and null-safe", () => {
  assert.equal(wordCountLabel({ released: ["A", "B"], progress: {} }), "2");
  assert.equal(wordCountLabel({ released: [] }), "0");
  assert.equal(wordCountLabel(null), "0");
});

test("wordCountLabel counts captured and pending words on the tutor side", () => {
  // Freshly captured words live in personalVocab (then pendingAdmission)
  // before admission moves them into released — the label must show them
  // as soon as a session ends, not three sightings later.
  const run = {
    released: ["WATER", "HOUSE"],
    progress: {
      WATER: { provenance: "pack" },
      HOUSE: { provenance: "pack" },
    },
    personalVocab: [{ word: "praia" }],
  };
  assert.equal(wordCountLabel(run), "2 + 1");

  run.pendingAdmission = [{ word: "saudade" }];
  run.released.push("TUTOR_FAROL");
  run.progress.TUTOR_FAROL = { provenance: "tutor" };
  assert.equal(wordCountLabel(run), "2 + 3");
});

// Nekh 2026-09-26: 100 of his 240 known words were hidden by the old
// 60/80 caps and Anna re-taught «зараз». A 250-word language must fit whole.
test("a full 250-word method vocabulary is shown in full, with no truncation trailer", () => {
  const released = [];
  const progress = {};
  const targetForms = {};
  const supportForms = {};
  for (let i = 0; i < 240; i++) {
    const cid = `W${i}`;
    released.push(cid);
    progress[cid] = { level: i < 81 ? 7 : 3, completed: i < 81, lastShownAt: i };
    targetForms[cid] = { form: `слово${i}` };
    supportForms[cid] = { form: `word${i}` };
  }
  const text = buildProfileText({ run: { released, progress }, targetForms, supportForms, targetLabel: "Ukrainian", supportLabel: "English", personalVocab: [] });
  assert.match(text, /PRODUCTION VOCABULARY \(81 words —/);
  assert.match(text, /PRACTICING \(159 words —/);
  assert.doesNotMatch(text, /not shown/);
  assert.match(text, /слово0,/, "the oldest production word is still there");
  assert.match(text, /слово81 = word81/, "the oldest practicing word is still there");
});

test("tutor-admitted concepts render as the word Anna taught, not the TUTOR_ id", () => {
  const run = {
    released: ["TUTOR_МЕЧ", "TUTOR_NOFORM"],
    progress: { "TUTOR_МЕЧ": { level: 1 }, "TUTOR_NOFORM": { level: 1 } },
    tutorVocab: { "TUTOR_МЕЧ": { word: "меч", translation: "sword", pos: "noun" } },
  };
  const text = buildProfileText({ run, targetForms: {}, supportForms: {}, targetLabel: "Ukrainian", supportLabel: "English", personalVocab: [] });
  assert.match(text, /меч = sword/);
  assert.doesNotMatch(text, /TUTOR_МЕЧ/);
  // No entry → the id still shows rather than crashing.
  assert.match(text, /TUTOR_NOFORM/);
});

test("an oversize profile shrinks JUST SEEN, then PRACTICING, and never exceeds the server's slice", () => {
  const released = [];
  const progress = {};
  const targetForms = {};
  const supportForms = {};
  const long = "x".repeat(120);
  for (let i = 0; i < 250; i++) {
    for (const [tier, level] of [["P", 7], ["R", 3], ["S", 1]]) {
      const cid = `${tier}${i}`;
      released.push(cid);
      progress[cid] = { level, completed: level === 7, lastShownAt: i };
      // Production words are normal length (they are never shrunk); the
      // two shrinkable tiers carry the bulk.
      targetForms[cid] = { form: tier === "P" ? `${tier}${i}` : `${tier}${i}${long}` };
      supportForms[cid] = { form: `s${i}` };
    }
  }
  const text = buildProfileText({ run: { released, progress }, targetForms, supportForms, targetLabel: "Ukrainian", supportLabel: "English", personalVocab: [] });
  assert.ok(text.length <= MAX_PROFILE_CHARS, `profile is ${text.length} chars`);
  assert.match(text, /JUST SEEN \(250 words, showing 10 most-recent/, "seen shrinks first, down to its floor");
  assert.match(text, /PRACTICING \(250 words, showing \d+ most-recent/);
  assert.match(text, /PRODUCTION VOCABULARY \(250 words —/, "production is never shrunk");
  assert.match(text, /not shown\)\n/, "trailers survive — no mid-word cut");
});

// Nekh 2026-09-26: five words sat at 2/3 for weeks because Anna could not
// tell them from the rest. The block now carries counts, the near-admission
// marker, and orders those first.
test("personal vocabulary shows sighting counts, marks 2/3 words and lists them first", () => {
  const text = buildProfileText({
    run: { released: [], progress: {} },
    targetForms: {}, supportForms: {},
    targetLabel: "Ukrainian", supportLabel: "English",
    personalVocab: [
      { word: "раз", translation: "time", seenInSessions: ["2026-09-21"] },
      { word: "план", translation: "plan", seenInSessions: ["2026-09-17", "2026-09-26"] },
      { word: "полювання", translation: "hunting", seenInSessions: [] },
      { word: "проти", translation: "against", seenInSessions: ["2026-09-21", "2026-09-22"], source: "learner" },
    ],
  });
  const line = text.split("\n").find((l) => l.startsWith("план") || l.startsWith("проти"));
  assert.match(line, /^(план|проти) = \w+ \(2\/3 — one more use adds it to the app\), (план|проти) = \w+ \(2\/3 — one more use adds it to the app\), раз = time \(1\/3\), полювання = hunting \(0\/3\)$/);
  assert.match(text, /PERSONAL VOCABULARY \(4 words from past conversations — yours or the learner's own; a word joins the app after being used in 3 different sessions/);
});
