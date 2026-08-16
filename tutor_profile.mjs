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

// The level tier is computed HERE, in code, and handed to the model as a
// fact — models are unreliable at counting long word lists themselves.
export function levelTier(tiers) {
  const known = tiers.production.length + tiers.practicing.length;
  if (known < 50) return { key: "ABSOLUTE BEGINNER", known, rule: "sentences of 3–6 words, one short question, gloss anything new" };
  if (known < 150) return { key: "EARLY LEARNER", known, rule: "single-clause sentences up to ~8 words, one question" };
  return { key: "DEVELOPING", known, rule: "normal i+1 conversation" };
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
  const tier = levelTier(tiers);
  const lines = [];

  lines.push(
    `LEVEL TIER (computed by the app — do not re-estimate): ${tier.key} ` +
      `(${tier.known} production+practicing words). Calibration: ${tier.rule}.`
  );
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

// Merges legacy device-local personal vocab (zth_tutor_<lang>) into the
// run's canonical list (USER.runs[lang].personalVocab — schema v2, synced
// cross-device via the existing save/load path). Dedupes case-insensitively
// by word with run entries winning, normalizes entries to the v2 shape
// (pos / seenInSessions / admittedAt), and only adds up to `cap` total
// entries. Returns { vocab, added } so callers persist only when the merge
// actually pulled something in.
export function mergePersonalVocab(runVocab, legacyVocab, cap) {
  const vocab = Array.isArray(runVocab) ? runVocab.slice() : [];
  const known = new Set(
    vocab.map((w) => String(w?.word || "").toLowerCase()).filter(Boolean)
  );
  let added = 0;
  for (const w of Array.isArray(legacyVocab) ? legacyVocab : []) {
    if (!w || !w.word) continue;
    const key = String(w.word).toLowerCase();
    if (known.has(key) || vocab.length >= cap) continue;
    vocab.push({
      word: w.word,
      translation: w.translation || "",
      note: w.note || "",
      pos: w.pos || "noun",
      seenInSessions: Array.isArray(w.seenInSessions) ? w.seenInSessions : [],
      admittedAt: w.admittedAt || null,
    });
    known.add(key);
    added++;
  }
  return { vocab, added };
}

// Word-count string for the tutor language-selection screen: pack words and
// tutor-admitted words counted separately — "284 + 5", not "289" — so the
// write-back is visible as a feature (and Nekh's fastest dogfood read on
// whether admission fires). Provenance (schema v2) is the signal.
export function wordCountLabel(run) {
  const released = Array.isArray(run?.released) ? run.released : [];
  const tutor = released.filter(
    (cid) => run?.progress?.[cid]?.provenance === "tutor"
  ).length;
  const pack = released.length - tutor;
  return tutor ? `${pack} + ${tutor}` : `${pack}`;
}

// Resolves which run the tutor should use. `lastActiveLanguage` was a
// null-forever field until v1.2.1, so old blobs (and blobs from before the
// learner's next app visit) need a fallback:
//   - pointer names a real run        -> use it
//   - exactly one run exists          -> use it
//   - several runs, no valid pointer  -> return candidates for the UI to ask
//   - no runs                         -> empty candidates
// Returns { targetLang, run, candidates } where candidates is
// [{lang, run}] sorted by released-word count, most progress first.
export function pickTutorRun(user) {
  const runs = user?.runs && typeof user.runs === "object" ? user.runs : {};
  const candidates = Object.entries(runs)
    .filter(([, run]) => run && typeof run === "object")
    .map(([lang, run]) => ({ lang, run }))
    .sort((a, b) => (b.run.released?.length || 0) - (a.run.released?.length || 0));

  const pointed = user?.lastActiveLanguage
    ? candidates.find((c) => c.lang === user.lastActiveLanguage)
    : null;
  if (pointed) return { targetLang: pointed.lang, run: pointed.run, candidates };
  if (candidates.length === 1) {
    return { targetLang: candidates[0].lang, run: candidates[0].run, candidates };
  }
  return { targetLang: null, run: null, candidates };
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
