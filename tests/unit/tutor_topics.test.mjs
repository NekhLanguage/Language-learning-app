// Conversation topics for Anna (beta): the pure topic store in
// tutor_topics.mjs and the server's BETA_EMAILS gate + topic prompt/schema.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  getTopics,
  createTopic,
  removeTopic,
  orderedTopics,
  renderTopicsText,
  applyTopicSummary,
  queueTopicProposals,
  getTopicProposals,
  acceptTopicProposal,
  dismissTopicProposal,
  MAX_TOPICS,
  MAX_TOPIC_PROPOSALS,
} from "../../tutor_topics.mjs";

const require = createRequire(import.meta.url);
const tutorFn = require("../../netlify/functions/tutor.js");

const fresh = () => ({ runs: {}, tutor: { prefs: {}, memory: {}, topics: [], topicProposals: [] } });

test("createTopic dedupes by name, trims, and caps the list", () => {
  const u = fresh();
  const a = createTopic(u, "  One   Piece ", { when: "2026-09-24" });
  assert.equal(a.name, "One Piece");
  assert.equal(createTopic(u, "one piece"), a);
  assert.equal(createTopic(u, "   "), null);
  for (let i = getTopics(u).length; i < MAX_TOPICS; i++) createTopic(u, `T${i}`);
  assert.equal(createTopic(u, "one too many"), null);
  assert.equal(getTopics(u).length, MAX_TOPICS);
});

test("getTopics repairs a blob with no topics field and drops dangling parents", () => {
  const u = { runs: {} };
  assert.deepEqual(getTopics(u), []);
  u.tutor.topics = [{ id: "t_a", name: "A", parentId: "t_gone" }, { id: "t_b", name: "B", parentId: "t_b" }, null, { id: "x" }];
  const topics = getTopics(u);
  assert.deepEqual(topics.map((t) => [t.id, t.parentId]), [["t_a", null], ["t_b", null]]);
});

test("removeTopic moves children up to the removed topic's parent", () => {
  const u = fresh();
  const books = createTopic(u, "Books");
  const manga = createTopic(u, "Manga", { parentId: books.id });
  const op = createTopic(u, "One Piece", { parentId: manga.id });
  assert.equal(removeTopic(u, manga.id), true);
  assert.equal(op.parentId, books.id);
  assert.equal(removeTopic(u, "nope"), false);
});

test("orderedTopics nests children under parents, most recent first", () => {
  const u = fresh();
  const books = createTopic(u, "Books", { when: "2026-09-01" });
  const cooking = createTopic(u, "Cooking", { when: "2026-09-20" });
  createTopic(u, "One Piece", { parentId: books.id, when: "2026-09-02" });
  const order = orderedTopics(u).map(({ topic, depth }) => `${depth}:${topic.name}`);
  assert.deepEqual(order, ["0:Cooking", "0:Books", "1:One Piece"]);
  assert.ok(cooking);
});

test("renderTopicsText lists every id and details only the active topic", () => {
  const u = fresh();
  const op = createTopic(u, "One Piece");
  op.notes = "Read up to chapter 1000.";
  const other = createTopic(u, "Cooking");
  const sessions = [
    { when: "2026-09-23", sessionSummary: "Talked about Luffy.", topicId: op.id },
    { when: "2026-09-22", sessionSummary: "Talked about pasta.", topicId: other.id },
  ];
  const text = renderTopicsText(u, op.id, sessions);
  assert.match(text, new RegExp(`ACTIVE TOPIC: "One Piece" \\(id ${op.id}\\)`));
  assert.match(text, /chapter 1000/);
  assert.match(text, /Talked about Luffy/);
  assert.doesNotMatch(text, /pasta/);
  assert.match(text, new RegExp(`- ${other.id} — Cooking`));
  assert.match(renderTopicsText(u, null, sessions), /ACTIVE TOPIC: none/);
});

test("applyTopicSummary: keeps the chosen topic, re-files, or creates a new one", () => {
  const u = fresh();
  const op = createTopic(u, "One Piece");
  const cooking = createTopic(u, "Cooking");

  const r1 = {};
  applyTopicSummary(u, r1, { assignedTopicId: op.id, newTopicName: "", topicNotes: "Chapter 1." }, op.id, "2026-09-24");
  assert.equal(r1.topicId, op.id);
  assert.equal(op.notes, "Chapter 1.");
  assert.equal(op.sessions, 1);

  // Drifted to another existing topic: Anna's id wins over the pick.
  const r2 = {};
  applyTopicSummary(u, r2, { assignedTopicId: cooking.id, newTopicName: "", topicNotes: "" }, op.id, "2026-09-24");
  assert.equal(r2.topicId, cooking.id);
  assert.equal(op.notes, "Chapter 1.", "empty notes never wipe a topic");

  // Free conversation that settled on a subject: new topic.
  const r3 = {};
  const res = applyTopicSummary(u, r3, { assignedTopicId: "", newTopicName: "Football", topicNotes: "Supports Flamengo." }, null, "2026-09-24");
  assert.equal(res.created.name, "Football");
  assert.equal(r3.topicId, res.created.id);

  // An unknown id falls back to the pick; nothing at all leaves it unfiled.
  const r4 = {};
  applyTopicSummary(u, r4, { assignedTopicId: "t_bogus", newTopicName: "", topicNotes: "" }, op.id, "2026-09-24");
  assert.equal(r4.topicId, op.id);
  const r5 = {};
  assert.equal(applyTopicSummary(u, r5, { assignedTopicId: "", newTopicName: "", topicNotes: "" }, null, "x").topicId, null);
  assert.equal(r5.topicId, null);
});

test("proposals: deduped, capped, and accepting one nests the grouped topics", () => {
  const u = fresh();
  const op = createTopic(u, "One Piece");
  const naruto = createTopic(u, "Naruto");
  queueTopicProposals(u, [
    { name: "Books in general", question: "Group these?", groupsTopicIds: [op.id, naruto.id, "t_bogus"] },
    { name: "books in general", question: "dup", groupsTopicIds: [] },
    { name: "One Piece", question: "exists", groupsTopicIds: [] },
    { name: "", question: "empty", groupsTopicIds: [] },
  ], "2026-09-24");
  assert.equal(getTopicProposals(u).length, 1);
  assert.deepEqual(getTopicProposals(u)[0].groupsTopicIds, [op.id, naruto.id]);

  for (let i = 0; i < 5; i++) queueTopicProposals(u, [{ name: `P${i}`, question: "", groupsTopicIds: [] }], "x");
  assert.equal(getTopicProposals(u).length, MAX_TOPIC_PROPOSALS);
  assert.match(getTopicProposals(u)[1].question, /P0/, "a missing question gets a default");

  const books = acceptTopicProposal(u, 0, "2026-09-24");
  assert.equal(books.name, "Books in general");
  assert.equal(op.parentId, books.id);
  assert.equal(naruto.parentId, books.id);
  assert.equal(dismissTopicProposal(u, 0), true);
  assert.equal(getTopicProposals(u).length, MAX_TOPIC_PROPOSALS - 2);
});

test("accepting a proposal never creates a parent cycle", () => {
  const u = fresh();
  const a = createTopic(u, "A");
  const b = createTopic(u, "B", { parentId: a.id });
  // Proposal "A" already exists → dropped. Force the cycle case by hand:
  u.tutor.topicProposals = [{ name: "B", question: "", groupsTopicIds: [a.id] }];
  const got = acceptTopicProposal(u, 0, "x"); // returns existing B
  assert.equal(got, b);
  assert.equal(a.parentId, null, "A must not become a child of its own child");
});

// --- server gate -----------------------------------------------------------

function withEnv(key, value, fn) {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

test("BETA_EMAILS: unset means nobody, a list means just those, * means all", () => {
  withEnv("BETA_EMAILS", undefined, () => assert.equal(tutorFn.betaFeatures("nekhbrazil@gmail.com").topics, false));
  withEnv("BETA_EMAILS", "", () => assert.equal(tutorFn.betaFeatures("nekhbrazil@gmail.com").topics, false));
  withEnv("BETA_EMAILS", "NekhBrazil@gmail.com", () => {
    assert.equal(tutorFn.betaFeatures("nekhbrazil@gmail.com").topics, true);
    assert.equal(tutorFn.betaFeatures("other@example.com").topics, false);
    assert.equal(tutorFn.betaFeatures("").topics, false);
  });
  withEnv("BETA_EMAILS", "*", () => assert.equal(tutorFn.betaFeatures("x@y.z").topics, true));
});

test("the topics block renders only when passed, after the memory", () => {
  const base = { targetLang: "Portuguese", supportLang: "English", profile: "", preferences: {}, memory: "", learnerFacts: "" };
  assert.doesNotMatch(tutorFn.contextBlock(base), /CONVERSATION TOPICS/);
  const withTopics = tutorFn.contextBlock({ ...base, topics: 'ACTIVE TOPIC: "One Piece" (id t_1)' });
  assert.match(withTopics, /CONVERSATION TOPICS/);
  assert.ok(withTopics.indexOf("=== MEMORY") < withTopics.indexOf("CONVERSATION TOPICS"));
});

test("the topics summary schema extends the base schema", () => {
  const s = tutorFn.SUMMARY_SCHEMA_WITH_TOPICS;
  for (const f of tutorFn.SUMMARY_SCHEMA.required) assert.ok(s.required.includes(f), f);
  assert.ok(s.required.includes("topic") && s.required.includes("proposedTopics"));
  assert.deepEqual(s.properties.topic.required, ["assignedTopicId", "newTopicName", "topicNotes"]);
  assert.equal(s.properties.proposedTopics.items.additionalProperties, false);
  // The base schema is untouched (non-beta learners get exactly what they had).
  assert.equal(tutorFn.SUMMARY_SCHEMA.properties.topic, undefined);
});
