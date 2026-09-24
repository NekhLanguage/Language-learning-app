// tutor_topics.mjs — conversation topics for Anna (beta, BETA_EMAILS).
//
// A topic groups conversations about one subject ("One Piece", "Books in
// general") so a new session can pick up where the last one on that
// subject stopped. Topics are user-level (USER.tutor.topics, schema v5):
// a subject is the same subject whichever language it is practiced in.
//
//   topic = { id, name, notes, parentId, createdAt, lastUsed, sessions }
//
// `notes` is Anna's running memory of the subject (chapters read,
// favourite characters, opinions given) — rewritten by her at the end of
// every session filed under the topic. `parentId` nests a topic under a
// broader one; Anna proposes those groupings (USER.tutor.topicProposals)
// and the learner accepts or dismisses each one — she never restructures
// on her own.
//
// Pure functions over the USER blob, so tutor.js and the unit tests share
// one implementation.

export const MAX_TOPICS = 30;
export const MAX_TOPIC_NAME_CHARS = 60;
export const MAX_TOPIC_NOTES_CHARS = 1200;
export const MAX_TOPIC_PROPOSALS = 3;
// Recent session summaries of the active topic sent with each request.
const TOPIC_SESSIONS_IN_PROMPT = 3;

function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_NAME_CHARS);
}

function sameName(a, b) {
  return cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
}

function newTopicId() {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function tutorRoot(user) {
  if (!user.tutor || typeof user.tutor !== "object") user.tutor = {};
  return user.tutor;
}

// The topic list, repaired in place (drops malformed rows, dangling parents).
export function getTopics(user) {
  const root = tutorRoot(user);
  if (!Array.isArray(root.topics)) root.topics = [];
  root.topics = root.topics.filter((t) => t && typeof t.id === "string" && cleanName(t.name));
  const ids = new Set(root.topics.map((t) => t.id));
  for (const t of root.topics) {
    if (t.parentId && (!ids.has(t.parentId) || t.parentId === t.id)) t.parentId = null;
  }
  return root.topics;
}

export function getTopicProposals(user) {
  const root = tutorRoot(user);
  if (!Array.isArray(root.topicProposals)) root.topicProposals = [];
  return root.topicProposals;
}

export function findTopic(user, id) {
  if (!id) return null;
  return getTopics(user).find((t) => t.id === id) || null;
}

// Creates a topic, or returns the existing one with the same name
// (case-insensitive). Returns null for an empty name or a full list.
export function createTopic(user, name, { parentId = null, when = "" } = {}) {
  const clean = cleanName(name);
  if (!clean) return null;
  const topics = getTopics(user);
  const existing = topics.find((t) => sameName(t.name, clean));
  if (existing) return existing;
  if (topics.length >= MAX_TOPICS) return null;
  const topic = {
    id: newTopicId(),
    name: clean,
    notes: "",
    parentId: parentId && topics.some((t) => t.id === parentId) ? parentId : null,
    createdAt: when,
    lastUsed: when,
    sessions: 0,
  };
  topics.push(topic);
  return topic;
}

// Deletes a topic. Its children move up to its parent; session records
// keep their topicId (a dangling id reads as "no topic").
export function removeTopic(user, id) {
  const topics = getTopics(user);
  const idx = topics.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const [gone] = topics.splice(idx, 1);
  for (const t of topics) if (t.parentId === id) t.parentId = gone.parentId || null;
  return true;
}

// Topics in display order: most recently used roots first, each followed
// by its children. Returns [{ topic, depth }]. Depth is capped by the data
// (a parent chain can't cycle: getTopics drops self-parents, and
// acceptTopicProposal never parents a topic under its own descendant).
export function orderedTopics(user) {
  const topics = getTopics(user);
  const byRecent = (a, b) => String(b.lastUsed || "").localeCompare(String(a.lastUsed || "")) || a.name.localeCompare(b.name);
  const out = [];
  const seen = new Set();
  const walk = (parentId, depth) => {
    for (const t of topics.filter((x) => (x.parentId || null) === parentId).sort(byRecent)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ topic: t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything unreachable (a cycle written by an older client) still shows.
  for (const t of topics) if (!seen.has(t.id)) out.push({ topic: t, depth: 0 });
  return out;
}

function isDescendant(topics, id, ancestorId) {
  let cur = topics.find((t) => t.id === id);
  const guard = new Set();
  while (cur && cur.parentId && !guard.has(cur.id)) {
    guard.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = topics.find((t) => t.id === cur.parentId);
  }
  return false;
}

// The TOPICS text block the server renders into Anna's context. Lists
// every topic by id (so the end-of-session record can name one) and, for
// the active topic, its notes and the last few sessions filed under it.
export function renderTopicsText(user, activeId, sessions = []) {
  const ordered = orderedTopics(user);
  const lines = [];
  const active = findTopic(user, activeId);
  if (active) {
    const parent = findTopic(user, active.parentId);
    lines.push(`ACTIVE TOPIC: "${active.name}" (id ${active.id})${parent ? ` — part of "${parent.name}"` : ""}`);
    lines.push(`Your notes on this topic: ${active.notes || "(none yet — this is the first conversation on it)"}`);
    const recent = sessions.filter((s) => s && s.topicId === active.id).slice(0, TOPIC_SESSIONS_IN_PROMPT);
    if (recent.length) {
      lines.push("Recent sessions on this topic (most recent first):");
      for (const s of recent) lines.push(`- ${s.when || "?"}: ${s.sessionSummary || ""}`);
    }
  } else {
    lines.push("ACTIVE TOPIC: none — the learner chose a free conversation.");
  }
  lines.push("");
  lines.push("ALL TOPICS (id — name):");
  if (!ordered.length) lines.push("(none yet)");
  for (const { topic, depth } of ordered) {
    lines.push(`${"  ".repeat(depth)}- ${topic.id} — ${topic.name}`);
  }
  return lines.join("\n");
}

// Files a finished session under a topic from Anna's end-of-session
// record. `chosenId` is what the learner picked at the start. Anna may
// re-file it (the conversation drifted to another existing topic) or name
// a new topic (a free conversation settled on a subject). Returns
// { topicId, created } — topicId null when the session stays unfiled.
export function applyTopicSummary(user, record, summaryTopic, chosenId, when) {
  const t = summaryTopic && typeof summaryTopic === "object" ? summaryTopic : {};
  let topic = findTopic(user, t.assignedTopicId) || null;
  let created = null;
  if (!topic && cleanName(t.newTopicName)) {
    const before = getTopics(user).length;
    topic = createTopic(user, t.newTopicName, { when });
    if (topic && getTopics(user).length > before) created = topic;
  }
  if (!topic) topic = findTopic(user, chosenId);
  if (!topic) {
    record.topicId = null;
    return { topicId: null, created: null };
  }
  record.topicId = topic.id;
  topic.lastUsed = when;
  topic.sessions = (Number(topic.sessions) || 0) + 1;
  const notes = String(t.topicNotes || "").trim();
  if (notes) topic.notes = notes.slice(0, MAX_TOPIC_NOTES_CHARS);
  return { topicId: topic.id, created };
}

// Queues Anna's proposed topics (typically a broader parent for several
// existing ones) for the learner to accept or dismiss. Drops proposals
// that name an existing topic or duplicate a queued one.
export function queueTopicProposals(user, proposals, when) {
  const queue = getTopicProposals(user);
  const topics = getTopics(user);
  const ids = new Set(topics.map((t) => t.id));
  const added = [];
  for (const p of Array.isArray(proposals) ? proposals : []) {
    const name = cleanName(p?.name);
    if (!name) continue;
    if (topics.some((t) => sameName(t.name, name))) continue;
    if (queue.some((q) => sameName(q.name, name))) continue;
    if (queue.length >= MAX_TOPIC_PROPOSALS) break;
    const proposal = {
      name,
      question: String(p.question || "").trim().slice(0, 300) || `Should I start a topic called "${name}"?`,
      groupsTopicIds: (Array.isArray(p.groupsTopicIds) ? p.groupsTopicIds : []).filter((id) => ids.has(id)),
      proposedAt: when,
    };
    queue.push(proposal);
    added.push(proposal);
  }
  return added;
}

// Learner said yes: create the topic and nest the grouped topics under it.
export function acceptTopicProposal(user, index, when) {
  const queue = getTopicProposals(user);
  const proposal = queue[index];
  if (!proposal) return null;
  queue.splice(index, 1);
  const topic = createTopic(user, proposal.name, { when });
  if (!topic) return null;
  const topics = getTopics(user);
  for (const id of proposal.groupsTopicIds || []) {
    const child = topics.find((t) => t.id === id);
    if (!child || child.id === topic.id) continue;
    if (isDescendant(topics, topic.id, child.id)) continue; // would cycle
    child.parentId = topic.id;
  }
  return topic;
}

export function dismissTopicProposal(user, index) {
  const queue = getTopicProposals(user);
  if (!queue[index]) return false;
  queue.splice(index, 1);
  return true;
}
