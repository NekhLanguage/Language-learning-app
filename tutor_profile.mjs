// tutor_profile.mjs
// Builds the learner-profile text block the AI tutor receives as ground
// truth. Pure functions over the persisted run state + vocab forms — no DOM,
// no fetch — so unit tests can exercise the tiering logic directly.
//
// Mastery tiers (from the 7-level ladder in progression.mjs):
//   production  — level >= 6 or completed: the learner types these from
//                 memory; the tutor can expect them in free conversation.
//   practicing  — level 3–5: recognized and used in guided exercises.
//   seen        — level 1–2 or released without progress: exposure only.

const PRODUCTION_MIN_LEVEL = 6;
const PRACTICING_MIN_LEVEL = 3;

// Mirrors the engine's formOf() base-form extraction for a single lang entry.
export function baseForm(entry, cid) {
  if (!entry) return cid;
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) return entry[0];
  if (typeof entry === "object" && entry.form) return entry.form;
  if (typeof entry === "object" && entry.base) return entry.base;
  return cid;
}

// Buckets every released concept into a mastery tier.
export function tierConcepts(run) {
  const tiers = { production: [], practicing: [], seen: [] };
  const released = Array.isArray(run?.released) ? run.released : [];
  const progress = run?.progress || {};
  for (const cid of released) {
    const p = progress[cid];
    if (p && (p.completed || p.level >= PRODUCTION_MIN_LEVEL)) tiers.production.push(cid);
    else if (p && p.level >= PRACTICING_MIN_LEVEL) tiers.practicing.push(cid);
    else tiers.seen.push(cid);
  }
  return tiers;
}

function wordList(cids, targetForms, supportForms) {
  return cids
    .map((cid) => {
      const t = baseForm(targetForms?.[cid], cid);
      const s = baseForm(supportForms?.[cid], cid);
      return t === s ? t : `${t} = ${s}`;
    })
    .join(", ");
}

// The full profile text block. `opts`:
//   run          — the persisted run object (released + progress)
//   targetForms  — GLOBAL_VOCAB-style forms map for the target language
//   supportForms — forms map for the support language
//   targetLabel / supportLabel — human names ("Portuguese", "English")
//   personalVocab — [{word, translation}] introduced by past tutor sessions
export function buildProfileText(opts) {
  const { run, targetForms, supportForms, targetLabel, supportLabel } = opts;
  const tiers = tierConcepts(run);
  const lines = [];

  lines.push(
    `Learning ${targetLabel} (support language: ${supportLabel}). ` +
      `App session number: ${run?.sessionNumber ?? 1}. ` +
      `Words released so far: ${(run?.released || []).length}.`
  );
  lines.push("");
  lines.push(
    `PRODUCTION VOCABULARY (${tiers.production.length} words — the learner types these from memory; build conversation on them):`
  );
  lines.push(wordList(tiers.production, targetForms, supportForms) || "(none yet)");
  lines.push("");
  lines.push(
    `PRACTICING (${tiers.practicing.length} words — recognized, used in guided exercises; recycle these often):`
  );
  lines.push(wordList(tiers.practicing, targetForms, supportForms) || "(none yet)");
  lines.push("");
  lines.push(
    `JUST SEEN (${tiers.seen.length} words — exposure only; use sparingly and re-gloss on first use):`
  );
  lines.push(wordList(tiers.seen, targetForms, supportForms) || "(none yet)");

  const personal = Array.isArray(opts.personalVocab) ? opts.personalVocab : [];
  lines.push("");
  lines.push(
    `PERSONAL VOCABULARY (${personal.length} words introduced in past tutor conversations — recycle deliberately):`
  );
  lines.push(
    personal.map((w) => `${w.word} = ${w.translation}`).join(", ") || "(none yet)"
  );

  return lines.join("\n");
}

// Renders stored session memory for the tutor's MEMORY block.
// `memory` = { sessions: [{when, sessionSummary, struggles, nextFocus}], ... }
export function buildMemoryText(memory) {
  const sessions = Array.isArray(memory?.sessions) ? memory.sessions : [];
  if (!sessions.length) return "";
  const lines = [];
  const latest = sessions[0];
  if (latest.nextFocus) lines.push(`CURRENT NEXT FOCUS: ${latest.nextFocus}`);
  for (const s of sessions) {
    const parts = [];
    if (s.when) parts.push(s.when);
    if (s.sessionSummary) parts.push(s.sessionSummary);
    const struggles = (s.struggles || []).join("; ");
    if (struggles) parts.push(`Struggles: ${struggles}`);
    lines.push(`- ${parts.join(" — ")}`);
  }
  return lines.join("\n");
}
