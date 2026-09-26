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

import { ADMISSION_THRESHOLD } from "./tutor_admission.mjs";

const PRODUCTION_MIN_LEVEL = 6;
const PRACTICING_MIN_LEVEL = 3;

// Bounded vocabulary context — bounded generously. The caps used to be
// 60 / 80 / 40, on the theory that a conversation never draws on more than
// ~140 words and anything past that was prompt bloat. The theory was
// wrong in the direction that matters: a known word the tutor cannot see
// is an UNKNOWN word to her, and she glosses and "teaches" it (Nekh
// 2026-09-26: 100 of his 240 known Ukrainian words were hidden, «зараз»
// among them, and Anna taught him "now"). The whole profile sits in the
// prompt-cached system block, so its per-turn cost is a cache read; a
// 250-word language at these caps is ~6–8k characters against the 20k
// budget (MAX_PROFILE_CHARS). Once a tier does overflow, the N
// most-recently-touched words are shown by RECENCY and the tail is
// annotated "(and N more not shown)" so the model knows the slice is not
// the whole picture.
//
// LEVEL TIER (see levelTier) counts the FULL production+practicing set so
// truncation never re-tiers the learner. The bound is on what the tutor
// sees, not on what the learner has.
const PROFILE_TIER_CAP = { production: 250, practicing: 250, seen: 60 };
const PERSONAL_VOCAB_CAP = 60;
// Mirrors MAX_PROFILE_CHARS in netlify/functions/tutor.js, which slices the
// profile blindly (mid-word) past this length. buildProfileText trims the
// JUST SEEN tier first, then PRACTICING, so an oversize profile loses its
// least useful words rather than its tail.
export const MAX_PROFILE_CHARS = 20000;

// Sort CIDs by lastShownAt desc (missing progress / no lastShownAt sort last),
// then take the top `cap`. Returns { shown, trimmed } — trimmed is the count
// of concepts omitted for the "(and N more)" trailer.
function boundedTierCids(cids, progress, cap) {
  if (cids.length <= cap) return { shown: cids, trimmed: 0 };
  const sorted = [...cids].sort((a, b) => {
    const la = progress?.[a]?.lastShownAt ?? 0;
    const lb = progress?.[b]?.lastShownAt ?? 0;
    return lb - la;
  });
  return { shown: sorted.slice(0, cap), trimmed: cids.length - cap };
}

// Personal-vocab recency: latest seenInSessions date wins, falling back to
// admittedAt for admitted entries with an empty session array (defensive —
// admitted entries do carry seenInSessions today).
function latestPersonalSighting(entry) {
  const sessions = Array.isArray(entry?.seenInSessions) ? entry.seenInSessions : [];
  if (sessions.length) return String(sessions[sessions.length - 1] || "");
  if (entry?.admittedAt) return String(entry.admittedAt);
  return "";
}

function sightings(entry) {
  return Array.isArray(entry?.seenInSessions) ? entry.seenInSessions.length : 0;
}

// Closest to admission first (a 2/3 word is one use from joining the app
// — the tutor should reach for it), then most recently seen.
function boundedPersonalVocab(personal, cap) {
  const sorted = [...personal].sort((a, b) =>
    (sightings(b) - sightings(a)) ||
    latestPersonalSighting(b).localeCompare(latestPersonalSighting(a))
  );
  if (personal.length <= cap) return { shown: sorted, trimmed: 0 };
  return { shown: sorted.slice(0, cap), trimmed: personal.length - cap };
}

// "план = plan (2/3 — one more use adds it to the app)". The count is what
// lets the tutor steer: without it every personal word looked the same and
// the ones one sighting from admission sat there for weeks (Nekh
// 2026-09-26: five at 2/3, twelve at 1/3 since August).
export function personalVocabEntry(entry) {
  const n = Math.min(sightings(entry), ADMISSION_THRESHOLD);
  const tag = n === ADMISSION_THRESHOLD - 1 ? `${n}/${ADMISSION_THRESHOLD} — one more use adds it to the app` : `${n}/${ADMISSION_THRESHOLD}`;
  return `${entry.word} = ${entry.translation} (${tag})`;
}

function tierHeader(label, total, shownCount, cap) {
  if (total <= cap) return `${label} (${total} words`;
  return `${label} (${total} words, showing ${shownCount} most-recent`;
}

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

// PRODUCTION words are rendered as the target form ONLY. The learner types
// these from memory, so the tutor needs no meaning to use them — and
// "зараз = now" is exactly the gloss shape she would otherwise copy into
// the chat. PRACTICING / JUST SEEN keep "target = support".
function wordList(cids, targetForms, supportForms, { translations = true } = {}) {
  return cids
    .map((cid) => {
      const t = baseForm(targetForms?.[cid], cid);
      if (!translations) return t;
      const s = baseForm(supportForms?.[cid], cid);
      return t === s ? t : `${t} = ${s}`;
    })
    .join(", ");
}

// Forms for tutor-admitted concepts (TUTOR_* cids). They live in
// run.tutorVocab, not in the lang/pack files, so without this overlay the
// profile shows the raw id ("TUTOR_МЕЧ") instead of «меч = sword».
export function tutorVocabForms(run) {
  const target = {};
  const support = {};
  for (const [cid, entry] of Object.entries(run?.tutorVocab || {})) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.word) target[cid] = String(entry.word);
    if (entry.translation) support[cid] = String(entry.translation);
  }
  return { target, support };
}

// The full profile text block. `opts`:
//   run          — the persisted run object (released + progress)
//   targetForms  — GLOBAL_VOCAB-style forms map for the target language
//   supportForms — forms map for the support language
//   targetLabel / supportLabel — human names ("Portuguese", "English")
//   personalVocab — [{word, translation}] introduced by past tutor sessions
//
// Each tier list is bounded (see PROFILE_TIER_CAP / PERSONAL_VOCAB_CAP): once
// a tier grows past its cap, the tutor sees the N most-recently-touched words
// plus a "(and X more not shown)" trailer. LEVEL TIER above still counts the
// FULL production+practicing set — bounding is a prompt-cost / attention
// control, not a re-tiering.
export function buildProfileText(opts) {
  const { run, targetLabel, supportLabel } = opts;
  const tv = tutorVocabForms(run);
  const targetForms = { ...(opts.targetForms || {}), ...tv.target };
  const supportForms = { ...(opts.supportForms || {}), ...tv.support };
  const tiers = tierConcepts(run);
  const tier = levelTier(tiers);
  const progress = run?.progress || {};
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

  const personal = Array.isArray(opts.personalVocab) ? opts.personalVocab : [];
  const per = boundedPersonalVocab(personal, PERSONAL_VOCAB_CAP);
  const personalLine = per.shown.map(personalVocabEntry).join(", ") || "(none yet)";

  // Render with the tier caps, then shrink the least useful tiers (JUST
  // SEEN, then PRACTICING) if the whole thing would overrun the server's
  // hard slice — a blind cut lands mid-word in the tail, which is exactly
  // where the practicing words the tutor should not re-teach sit.
  const caps = { ...PROFILE_TIER_CAP };
  const render = () => {
    const out = [...lines];
    const prod = boundedTierCids(tiers.production, progress, caps.production);
    out.push(
      `${tierHeader("PRODUCTION VOCABULARY", tiers.production.length, prod.shown.length, caps.production)} — the learner types these from memory: build conversation on them, and NEVER gloss, translate or explain them):`
    );
    out.push(renderCidList(prod, targetForms, supportForms, { translations: false }));
    out.push("");

    const prac = boundedTierCids(tiers.practicing, progress, caps.practicing);
    out.push(
      `${tierHeader("PRACTICING", tiers.practicing.length, prac.shown.length, caps.practicing)} — recognized, used in guided exercises; recycle these often, used plainly with no gloss — a translation next to one tells the learner you think they don't know it):`
    );
    out.push(renderCidList(prac, targetForms, supportForms));
    out.push("");

    const seen = boundedTierCids(tiers.seen, progress, caps.seen);
    out.push(
      `${tierHeader("JUST SEEN", tiers.seen.length, seen.shown.length, caps.seen)} — exposure only; use sparingly and gloss once on first use):`
    );
    out.push(renderCidList(seen, targetForms, supportForms));

    out.push("");
    out.push(
      `${tierHeader("PERSONAL VOCABULARY", personal.length, per.shown.length, PERSONAL_VOCAB_CAP)} from past conversations — yours or the learner's own; a word joins the app after being used in ${ADMISSION_THRESHOLD} different sessions, so when a ${ADMISSION_THRESHOLD - 1}/${ADMISSION_THRESHOLD} word fits a sentence, use it rather than a synonym):`
    );
    out.push(per.trimmed ? `${personalLine} (and ${per.trimmed} more not shown)` : personalLine);
    return out.join("\n");
  };

  let text = render();
  for (const tier of ["seen", "practicing"]) {
    while (text.length > MAX_PROFILE_CHARS && caps[tier] > 10) {
      caps[tier] = Math.max(10, Math.floor(caps[tier] / 2));
      text = render();
    }
  }
  return text;
}

function renderCidList({ shown, trimmed }, targetForms, supportForms, listOpts) {
  const body = wordList(shown, targetForms, supportForms, listOpts) || "(none yet)";
  return trimmed ? `${body} (and ${trimmed} more not shown)` : body;
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
// tutor words counted separately — "284 + 5", not "289" — so the write-back
// is visible as a feature (and Nekh's fastest dogfood read on whether
// admission fires). The tutor side is every word Anna holds for the learner,
// wherever it sits in the admission pipeline: captured (personalVocab),
// pending (pendingAdmission), or admitted into released (provenance
// "tutor"). The three buckets are disjoint — admission removes from the
// first two — so summing never double-counts.
export function wordCountLabel(run) {
  const released = Array.isArray(run?.released) ? run.released : [];
  const admitted = released.filter(
    (cid) => run?.progress?.[cid]?.provenance === "tutor"
  ).length;
  const captured =
    (Array.isArray(run?.personalVocab) ? run.personalVocab.length : 0) +
    (Array.isArray(run?.pendingAdmission) ? run.pendingAdmission.length : 0);
  const tutor = admitted + captured;
  const pack = released.length - admitted;
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
