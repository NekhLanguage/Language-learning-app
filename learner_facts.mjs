// learner_facts.mjs
// Small append-only durable-fact set carrying identity/subject facts the
// tutor must never forget across sessions ("learner is Norwegian teaching
// in Norway", "Pokémon is a video-game franchise, not real animals",
// "main target language is Ukrainian"). Distinct from personalVocab —
// this is NOT words, it is subject/identity ground truth injected verbatim
// into the tutor system prompt above the vocabulary profile.
//
// Policy (locked by Dan 2026-08-16 as step 1 of the bounded tutor context
// redesign):
//   - User-level, cross-language. Identity facts don't repeat per language
//     (Nekh is Norwegian whether he's practicing Ukrainian or Spanish).
//   - Hard cap: 20 entries. Not soft — writes past the cap either replace
//     an existing entry (correction) or drop silently. The tutor system
//     prompt has to stay bounded so the store scales with the user, not
//     with session count.
//   - "Corrections earn a slot": a write flagged as a correction of an
//     existing entry replaces the corrected entry (even at cap). Non-
//     corrective writes at cap are dropped — new noise never evicts an
//     accepted fact, only an explicit correction of that fact does.
//   - Read verbatim, no compression, above vocab context in the tutor
//     system prompt.

export const LEARNER_FACTS_CAP = 20;
const MAX_FACT_CHARS = 200;

// Null-safe getter — legacy blobs (pre-schema-v3) or a fresh user with no
// facts yet return []. Callers can treat the result as read-only; use
// addLearnerFact / correctLearnerFact for mutations.
export function getLearnerFacts(user) {
  return Array.isArray(user?.learnerFacts) ? user.learnerFacts : [];
}

function normalize(text) {
  return String(text || "").trim().slice(0, MAX_FACT_CHARS);
}

// Adds a new fact. Returns { added, entry }:
//   - added=true, entry=new  — the fact was accepted.
//   - added=false, entry=existing — a case-insensitive duplicate already
//                                   held; the caller may treat this as a
//                                   no-op success.
//   - added=false, entry=null — the store is at cap OR the text was empty;
//                               dropped silently.
export function addLearnerFact(user, text, { source = "tutor", addedAt = null } = {}) {
  const trimmed = normalize(text);
  if (!trimmed) return { added: false, entry: null };
  if (!Array.isArray(user.learnerFacts)) user.learnerFacts = [];
  const key = trimmed.toLowerCase();
  const dupIndex = user.learnerFacts.findIndex(
    (f) => String(f?.text || "").toLowerCase() === key
  );
  if (dupIndex !== -1) return { added: false, entry: user.learnerFacts[dupIndex] };
  if (user.learnerFacts.length >= LEARNER_FACTS_CAP) return { added: false, entry: null };
  const entry = { text: trimmed, source, addedAt };
  user.learnerFacts.push(entry);
  return { added: true, entry };
}

// Corrects an existing fact: the entry whose text matches `oldText`
// (case-insensitive) is REPLACED by `newText`. Corrections always land,
// even at cap. If the target doesn't exist, falls back to a normal add
// (which then respects the cap — a "correction" against a store that
// doesn't hold the old fact is really a fresh add).
export function correctLearnerFact(user, oldText, newText, { source = "tutor", addedAt = null } = {}) {
  if (!Array.isArray(user.learnerFacts)) user.learnerFacts = [];
  const trimmed = normalize(newText);
  if (!trimmed) return { corrected: false, entry: null };
  const oldKey = String(oldText || "").trim().toLowerCase();
  const idx = oldKey
    ? user.learnerFacts.findIndex((f) => String(f?.text || "").toLowerCase() === oldKey)
    : -1;
  if (idx === -1) {
    const { added, entry } = addLearnerFact(user, newText, { source, addedAt });
    return { corrected: false, entry: added ? entry : null };
  }
  const entry = { text: trimmed, source, addedAt };
  user.learnerFacts[idx] = entry;
  return { corrected: true, entry };
}

// Renders the facts for the tutor system prompt, verbatim as a bullet list.
// Empty list returns "" so the caller can decide whether to emit the block.
export function renderLearnerFactsText(facts) {
  const list = Array.isArray(facts) ? facts : [];
  if (!list.length) return "";
  return list.map((f) => `- ${f?.text || ""}`).filter((l) => l !== "- ").join("\n");
}

// Applies a tutor session's newLearnerFacts + correctedLearnerFacts to the
// user (mutated in place). The bounded write-path — separate from the vocab
// admission pipeline (`tutor_admission.mjs`). Returns
// { added:[entry...], corrected:[{from,entry}...], dropped:[text...] } so
// the caller can surface what actually landed.
//
// Shape expected from the tutor summary:
//   summary.newLearnerFacts       — array of strings, each a self-contained fact
//   summary.correctedLearnerFacts — array of {replaces, text}: the `replaces`
//                                    string matches an existing fact (case-
//                                    insensitive), `text` is the new wording
export function applyTutorLearnerFacts(user, summary, today) {
  const result = { added: [], corrected: [], dropped: [] };
  const corrections = Array.isArray(summary?.correctedLearnerFacts) ? summary.correctedLearnerFacts : [];
  const additions = Array.isArray(summary?.newLearnerFacts) ? summary.newLearnerFacts : [];
  // Corrections first: freeing a slot before an add helps at cap.
  for (const c of corrections) {
    if (!c || !c.text) continue;
    const r = correctLearnerFact(user, c.replaces || "", c.text, { addedAt: today });
    if (r.corrected) result.corrected.push({ from: c.replaces || "", entry: r.entry });
    else if (r.entry) result.added.push(r.entry);
    else result.dropped.push(normalize(c.text));
  }
  for (const text of additions) {
    if (!text) continue;
    const r = addLearnerFact(user, text, { addedAt: today });
    if (r.added) result.added.push(r.entry);
    else if (!r.entry) result.dropped.push(normalize(text));
  }
  return result;
}
