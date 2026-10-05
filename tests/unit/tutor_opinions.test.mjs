// The Opinions subject in Anna's topic picker (tutor_opinions.mjs): the
// theme list, the fewest-first roll, the built-in topic, the theme lines
// in the topics text, and the server's brief + themeNote plumbing.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  OPINION_THEMES,
  OPINIONS_KIND,
  OPINIONS_TOPIC_NAME,
  THEME_SESSIONS_IN_PROMPT,
  themeById,
  themeLabel,
  findOpinionsTopic,
  ensureOpinionsTopic,
  themeSessions,
  themeCounts,
  themeProgress,
  rollOpinionTheme,
  renderThemeText,
  themePickLine,
} from "../../tutor_opinions.mjs";
import { createTopic, getTopics, renderTopicsText, applyTopicSummary, MAX_TOPICS } from "../../tutor_topics.mjs";

const require = createRequire(import.meta.url);
const tutorFn = require("../../netlify/functions/tutor.js");

const fresh = () => ({ runs: {}, tutor: { prefs: {}, memory: {}, topics: [], topicProposals: [] } });
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("19 themes, unique ids and keys, every one with an English label and a brief", () => {
  assert.equal(OPINION_THEMES.length, 19);
  assert.equal(new Set(OPINION_THEMES.map((t) => t.id)).size, 19);
  assert.equal(new Set(OPINION_THEMES.map((t) => t.key)).size, 19);
  for (const t of OPINION_THEMES) {
    assert.match(t.key, /^opinionTheme[A-Z]/, t.id);
    assert.ok(t.en.length > 3 && t.brief.endsWith("?"), t.id);
  }
  assert.equal(OPINION_THEMES.some((t) => /sunday/i.test(t.en)), false, "Sunday shopping was dropped");
  assert.equal(themeById("phones_school").key, "opinionThemePhonesSchool");
  assert.equal(themeById("nope"), null);
});

test("every language file translates every Opinions label and the picker strings", () => {
  const dir = path.join(process.cwd(), "lang");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 19);
  for (const f of files) {
    const ui = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).uiStrings || {};
    for (const key of ["opinionsPick", "opinionsProgress", ...OPINION_THEMES.map((t) => t.key)]) {
      assert.ok(typeof ui[key] === "string" && ui[key].trim(), `${f} ${key}`);
    }
    for (const ph of ["{done}", "{total}", "{sessions}"]) assert.ok(ui.opinionsProgress.includes(ph), `${f} opinionsProgress ${ph}`);
  }
});

test("themeLabel prefers the support language and falls back to English", () => {
  const t = themeById("big_city");
  assert.equal(themeLabel(t, { opinionThemeBigCity: "Å bo i en storby" }), "Å bo i en storby");
  assert.equal(themeLabel(t, { opinionThemeBigCity: "  " }), t.en);
  assert.equal(themeLabel(t, null), t.en);
});

test("ensureOpinionsTopic creates the marked topic once and reuses a learner-made one", () => {
  const u = fresh();
  assert.equal(findOpinionsTopic(u), null);
  const a = ensureOpinionsTopic(u, "2026-10-05");
  assert.equal(a.name, OPINIONS_TOPIC_NAME);
  assert.equal(a.kind, OPINIONS_KIND);
  assert.equal(ensureOpinionsTopic(u), a);
  assert.equal(getTopics(u).length, 1);
  assert.equal(findOpinionsTopic(u), a);

  const v = fresh();
  const mine = createTopic(v, "opinions");
  assert.equal(ensureOpinionsTopic(v), mine, "same name, case-insensitive");
  assert.equal(mine.kind, OPINIONS_KIND);

  const full = fresh();
  for (let i = 0; i < MAX_TOPICS; i++) createTopic(full, `T${i}`);
  assert.equal(ensureOpinionsTopic(full), null);
});

test("the kind survives getTopics repair and filing a session under the topic", () => {
  const u = fresh();
  const topic = ensureOpinionsTopic(u, "2026-10-05");
  u.tutor.topics = JSON.parse(JSON.stringify(u.tutor.topics));
  assert.equal(getTopics(u)[0].kind, OPINIONS_KIND);
  const record = { themeId: "big_city" };
  applyTopicSummary(u, record, { assignedTopicId: topic.id, newTopicName: "", topicNotes: "Likes cities." }, topic.id, "2026-10-05");
  assert.equal(record.topicId, topic.id);
  assert.equal(record.themeId, "big_city", "the theme tag is untouched by filing");
  assert.equal(findOpinionsTopic(u).sessions, 1);
});

test("theme sessions, counts and progress come from the session records", () => {
  const sessions = [
    { when: "2026-10-05", themeId: "big_city", themeNote: "Second go." },
    { when: "2026-10-03", themeId: "homework", sessionSummary: "Homework chat." },
    { when: "2026-10-01", themeId: "big_city", sessionSummary: "First go." },
    { when: "2026-09-30", topicId: "t_other" },
    null,
  ];
  assert.deepEqual(themeSessions(sessions, "big_city").map((s) => s.when), ["2026-10-05", "2026-10-01"]);
  assert.deepEqual(themeSessions(sessions, null), []);
  const counts = themeCounts(sessions);
  assert.equal(counts.get("big_city"), 2);
  assert.equal(counts.get("homework"), 1);
  assert.equal(counts.get("exercise"), 0);
  assert.deepEqual(themeProgress(sessions), { done: 2, total: 19, conversations: 3 });
  assert.deepEqual(themeProgress([]), { done: 0, total: 19, conversations: 0 });
});

test("rollOpinionTheme: fewest-played first, no immediate repeat, every theme before round two", () => {
  // Nothing played: any theme; rng 0 → the first, rng ~1 → the last.
  assert.equal(rollOpinionTheme([], { rng: () => 0 }).id, OPINION_THEMES[0].id);
  assert.equal(rollOpinionTheme([], { rng: () => 0.999 }).id, OPINION_THEMES.at(-1).id);

  // One round played: the roll walks through every theme before repeating.
  const sessions = [];
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 19; i++) {
    const t = rollOpinionTheme(sessions, { lastId: last, rng: () => 0.37 });
    assert.ok(!seen.has(t.id), `repeat before the round is done: ${t.id}`);
    seen.add(t.id);
    sessions.unshift({ when: `d${i}`, themeId: t.id });
    last = t.id;
  }
  assert.equal(seen.size, 19);
  // Round two: not the theme just played, and only from the fewest-played.
  const next = rollOpinionTheme(sessions, { lastId: last, rng: () => 0.999 });
  assert.notEqual(next.id, last);
  sessions.unshift({ when: "x", themeId: next.id });
  const again = rollOpinionTheme(sessions, { lastId: next.id, rng: () => 0 });
  assert.notEqual(again.id, next.id);
  assert.equal(themeCounts(sessions).get(again.id), 1, "a once-played theme, never the twice-played one");

  // The one theme a whole round behind is the only candidate — even if it was last.
  const behind = OPINION_THEMES.map((t) => ({ themeId: t.id })).filter((s) => s.themeId !== "exercise");
  const twice = [...behind, ...behind];
  assert.equal(rollOpinionTheme(twice, { lastId: "exercise", rng: () => 0.5 }).id, "exercise");
  assert.equal(rollOpinionTheme(twice, { lastId: null, rng: seq(0.1, 0.9) }).id, "exercise");
});

test("renderThemeText: the brief, the count, and the previous notes (newest first, capped)", () => {
  const t = themeById("phones_school");
  const first = renderThemeText(t, []);
  assert.match(first, /THIS CONVERSATION'S BRIEF: Should children be allowed to use phones at school\?/);
  assert.match(first, /learner's 1st conversation on it — a new theme for them\./);
  assert.doesNotMatch(first, /PREVIOUS CONVERSATIONS/);

  const sessions = [
    { when: "2026-10-05", themeId: "phones_school", themeNote: "Note 4" },
    { when: "2026-10-04", themeId: "phones_school", sessionSummary: "Summary 3 (no note)" },
    { when: "2026-10-03", themeId: "homework", themeNote: "other theme" },
    { when: "2026-10-02", themeId: "phones_school", themeNote: "Note 2" },
    { when: "2026-10-01", themeId: "phones_school", themeNote: "Note 1" },
  ];
  const text = renderThemeText(t, sessions);
  assert.match(text, /learner's 5th conversation on it\./);
  const notes = text.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(notes.length, THEME_SESSIONS_IN_PROMPT);
  assert.deepEqual(notes, ["- 2026-10-05: Note 4", "- 2026-10-04: Summary 3 (no note)", "- 2026-10-02: Note 2"]);
  assert.doesNotMatch(text, /other theme/);
  assert.equal(renderThemeText(null, sessions), "");
});

test("renderTopicsText puts the theme lines right under the active topic", () => {
  const u = fresh();
  const topic = ensureOpinionsTopic(u, "2026-10-05");
  topic.notes = "Argues well, forgets articles.";
  const sessions = [{ when: "2026-10-01", themeId: "big_city", topicId: topic.id, themeNote: "Took the city side.", sessionSummary: "City talk" }];
  const themeText = renderThemeText(themeById("big_city"), sessions);
  const text = renderTopicsText(u, topic.id, sessions, themeText);
  const i = (s) => text.indexOf(s);
  assert.ok(i('ACTIVE TOPIC: "Opinions"') < i("THIS CONVERSATION'S BRIEF"));
  assert.ok(i("THIS CONVERSATION'S BRIEF") < i("Your notes on this topic: Argues well"));
  assert.match(text, /Took the city side\./);
  // No theme: the text is exactly what it was before.
  assert.doesNotMatch(renderTopicsText(u, topic.id, sessions), /BRIEF/);
  assert.doesNotMatch(renderTopicsText(u, null, sessions, themeText), /BRIEF/, "theme lines need an active topic");
});

test("themePickLine says new theme, or which time it is and when the last one was", () => {
  assert.match(themePickLine("Phones in school", [], "phones_school"), /^Theme: Phones in school — new theme\./);
  const sessions = [{ when: "2026-09-20", themeId: "phones_school" }, { when: "2026-09-01", themeId: "phones_school" }];
  assert.match(themePickLine("Phones in school", sessions, "phones_school"), /your 3rd time \(last 2026-09-20\)/);
});

// --- server ------------------------------------------------------------------

test("the topics block carries the brief rule only when a brief is passed", () => {
  const base = { targetLang: "Norwegian", supportLang: "English", profile: "", preferences: {}, memory: "", learnerFacts: "", topics: 'ACTIVE TOPIC: "Opinions" (id t_1)' };
  const plain = tutorFn.contextBlock(base);
  assert.doesNotMatch(plain, /BRIEF/);
  const withBrief = tutorFn.contextBlock({ ...base, topicBrief: "Should children have homework?" });
  assert.match(withBrief, /THIS CONVERSATION'S BRIEF \(an Opinions theme the learner rolled\): "Should children have homework\?"/);
  assert.match(withBrief, /never a request to speak at length/);
  assert.match(withBrief, /PREVIOUS CONVERSATIONS ON THIS THEME are listed, read them first/);
  // Non-beta prompt (no topics) ignores a stray brief.
  assert.doesNotMatch(tutorFn.contextBlock({ ...base, topics: "", topicBrief: "x" }), /BRIEF|CONVERSATION TOPICS/);
});

test("the per-turn trailer restates the brief after the topic, and only with a topic", () => {
  const prefs = { note: "help me read Rave Master" };
  const withBoth = tutorFn.steeringTrailer(prefs, "Opinions", 3, "Should children have homework?");
  assert.match(withBoth, /THIS conversation: "Opinions"/);
  assert.match(withBoth, /The brief for this conversation: "Should children have homework\?"/);
  assert.ok(withBoth.indexOf('"Opinions"') < withBoth.indexOf("The brief"));
  assert.doesNotMatch(tutorFn.steeringTrailer(prefs, "", 3, "Should children have homework?"), /brief/);
});

test("the topics summary schema requires themeNote; the base schema does not", () => {
  const s = tutorFn.SUMMARY_SCHEMA_WITH_TOPICS;
  assert.ok(s.required.includes("themeNote"));
  assert.equal(s.properties.themeNote.type, "string");
  assert.match(s.properties.themeNote.description, /BRIEF/);
  assert.match(s.properties.themeNote.description, /Empty string when there was no brief/);
  assert.equal(tutorFn.SUMMARY_SCHEMA.properties.themeNote, undefined);
  assert.equal(tutorFn.MAX_TOPIC_BRIEF_CHARS, 300);
});
