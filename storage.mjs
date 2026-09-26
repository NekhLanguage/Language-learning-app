// storage.mjs
// User-state safety: schema versioning, migration, and corruption recovery
// for the persisted `zth_user` blob. Pure functions — app.js owns the actual
// localStorage reads/writes, unit tests exercise the logic directly.

export const CURRENT_SCHEMA_VERSION = 5;

export const USER_KEY = "zth_user";
export const USER_BACKUP_KEY = "zth_user_backup";

// The persisted-default shape of a templateProgress row (Emi 2026-08-28-22).
// A row equal to these defaults carries no user progress and is dropped
// before persist; `ensureTemplateProgress` in app.js re-creates it lazily on
// next access. `lastShownAt` uses `null` because `-Infinity` — the in-memory
// default — is not JSON-serialisable and comes back as `null` after a
// save/load round-trip; every row that has never been shown is written that
// way, so `null` is the correct persisted default to match against.
export const TEMPLATE_PROGRESS_DEFAULT_FIELDS = Object.freeze([
  "streak", "reinforcementStage", "completed", "lastShownAt", "lastResult",
]);

export function isDefaultTemplateProgress(row) {
  if (!row || typeof row !== "object") return false;
  const keys = Object.keys(row);
  if (keys.length !== TEMPLATE_PROGRESS_DEFAULT_FIELDS.length) return false;
  for (const k of keys) {
    if (!TEMPLATE_PROGRESS_DEFAULT_FIELDS.includes(k)) return false;
  }
  if (row.streak !== 0) return false;
  if (row.reinforcementStage !== 0) return false;
  if (row.completed !== false) return false;
  if (row.lastResult !== null) return false;
  // lastShownAt: in-memory default is -Infinity, on the persist round-trip
  // it comes back as null. Both count as untouched.
  const shown = row.lastShownAt;
  if (shown !== null && shown !== -Infinity) return false;
  return true;
}

// Returns a persist-ready copy of `user` with default-only templateProgress
// rows stripped from every run. The original object is not mutated — the
// live in-memory USER keeps every rehydrated row so nothing observable
// changes for the running app (Emi 2026-08-28-22: 690 of 794 rows across
// 10 languages carried defaults and made loadUser hit 504).
export function compactUserForPersist(user) {
  if (!user || typeof user !== "object") return user;
  const runs = user.runs;
  if (!runs || typeof runs !== "object") return user;

  const out = { ...user, runs: { ...runs } };
  for (const [lang, run] of Object.entries(runs)) {
    if (!run || typeof run !== "object") continue;
    const tp = run.templateProgress;
    if (!tp || typeof tp !== "object") continue;
    const compact = {};
    for (const [id, row] of Object.entries(tp)) {
      if (isDefaultTemplateProgress(row)) continue;
      compact[id] = row;
    }
    out.runs[lang] = { ...run, templateProgress: compact };
  }
  return out;
}

// Upgrades a user blob (in place) to the current schema. Add a numbered
// block here whenever the shape of USER changes; each block must be safe to
// run on state written by any older version of the app.
export function migrateUserState(user) {
  if (!user || typeof user !== "object") return user;

  if (!user.schemaVersion) {
    // v0 → v1: blobs written before versioning existed. Shape is unchanged;
    // this just stamps them.
    user.schemaVersion = 1;
  }

  if (user.schemaVersion < 2) {
    // v1 → v2: tutor→app vocabulary write-back groundwork.
    // - Every concept-progress entry gets `provenance` ("pack" — nothing
    //   tutor-admitted can exist before v2) and `admittedFrom` (null unless
    //   tutor-admitted). Retention analytics depend on this stamp existing
    //   from day one.
    // - `personalVocab` / `pendingAdmission` move into the run so tutor
    //   vocabulary rides the existing Supabase save/load path cross-device
    //   (the legacy device-local zth_tutor_<lang> copy is merged in by
    //   tutor.js on first load).
    for (const run of Object.values(user.runs || {})) {
      if (!run || typeof run !== "object") continue;
      for (const p of Object.values(run.progress || {})) {
        if (!p || typeof p !== "object") continue;
        if (!p.provenance) p.provenance = "pack";
        if (p.admittedFrom === undefined) p.admittedFrom = null;
      }
      if (!Array.isArray(run.personalVocab)) run.personalVocab = [];
      if (!Array.isArray(run.pendingAdmission)) run.pendingAdmission = [];
    }
    user.schemaVersion = 2;
  }

  if (user.schemaVersion < 3) {
    // v2 → v3: learner-facts store (bounded tutor context, step 1).
    // User-level (not per-run) because identity facts cross languages —
    // "learner is Norwegian" is true whether they're practicing Ukrainian
    // or Spanish, and duplicating the fact per run would waste both the
    // cap and the model's attention. Seeded empty; the tutor write-path
    // fills it. See `learner_facts.mjs` for the policy.
    if (!Array.isArray(user.learnerFacts)) user.learnerFacts = [];
    user.schemaVersion = 3;
  }

  if (user.schemaVersion < 4) {
    // v3 → v4: tutor preferences + session memory move into the synced
    // user record. Before v4 they lived only in device-local localStorage
    // (zth_tutor_prefs_<lang> / zth_tutor_<lang>), so a new device — or a
    // cleared browser — lost Anna's instructions and the session history.
    // `tutor.prefs[lang]` holds the coaching dials plus the learner's
    // free-text instructions; `tutor.memory[lang].sessions` holds the
    // bounded session summaries. tutor.js migrates the legacy localStorage
    // copies in on first load.
    if (!user.tutor || typeof user.tutor !== "object") user.tutor = {};
    if (!user.tutor.prefs || typeof user.tutor.prefs !== "object") user.tutor.prefs = {};
    if (!user.tutor.memory || typeof user.tutor.memory !== "object") user.tutor.memory = {};
    user.schemaVersion = 4;
  }

  if (user.schemaVersion < 5) {
    // v4 → v5: conversation topics for Anna (beta). User-level, like
    // learnerFacts — a subject is the same subject in every language.
    // `tutor.topics` holds the topic list (see tutor_topics.mjs);
    // `tutor.topicProposals` the broader topics Anna suggested that the
    // learner hasn't answered yet. Session records gain an optional
    // `topicId`; older records simply have none.
    if (!user.tutor || typeof user.tutor !== "object") user.tutor = {};
    if (!Array.isArray(user.tutor.topics)) user.tutor.topics = [];
    if (!Array.isArray(user.tutor.topicProposals)) user.tutor.topicProposals = [];
    user.schemaVersion = 5;
  }

  return user;
}

// Parses and migrates the stored user blob, falling back to the backup blob
// when the primary is corrupt. Returns { user, source } where source is
// "primary", "backup", or null (nothing recoverable — caller starts fresh).
export function recoverUser(raw, backupRaw) {
  for (const [source, candidate] of [["primary", raw], ["backup", backupRaw]]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && parsed.runs !== undefined) {
        return { user: migrateUserState(parsed), source };
      }
    } catch {
      // fall through to the next candidate
    }
  }
  return { user: null, source: null };
}

// Which copy wins when the server answers a load. loadUserFromServer used
// to adopt the server blob unconditionally, so a stale server copy — a save
// that 504'd, a flaky connection, an older second device — silently rolled
// the learner back to the last state that happened to reach Supabase, with
// no warning (Emi 2026-09-02-55: two full runs of progress gone).
// `lastLocalChange` is stamped on every saveUser and travels inside the
// blob, so a server copy carries the timestamp of the save that produced
// it. Rules: nothing local yet (no runs) → the server answer wins, even a
// null one (fresh device, first login); local has runs and the server has
// no copy → keep local; otherwise the newer timestamp wins, ties to the
// server (a just-completed save reads back as equal).
export function shouldAdoptServerUser(local, server) {
  // Nothing local yet (fresh device, first login, a wiped blob): whatever
  // the server says — a copy or "no account" — is the starting point.
  if (!local || typeof local !== "object") return true;
  const localRuns = local.runs && typeof local.runs === "object"
    ? Object.keys(local.runs).length : 0;
  if (!localRuns) return true;
  // Local has progress and the server has nothing (null user): a read
  // miss is indistinguishable from "no account" — keep local (Emi
  // 2026-09-02-61: the old caller went straight to createEmptyUser).
  if (!server || typeof server !== "object") return false;
  const localChange = Number(local.lastLocalChange) || 0;
  const serverChange = Number(server.lastLocalChange) || 0;
  if (!localChange) return true;
  return serverChange >= localChange;
}

// --- Field-level merge for the tutor-owned part of the record ---------------
//
// shouldAdoptServerUser picks ONE whole copy. That is right for run
// progress (the app is its only writer, and a run has no per-field clock),
// but Anna's state — tutor.prefs/memory/topics/topicProposals, learnerFacts,
// and the per-run tutor vocabulary — is written only by tutor.html, on
// whichever device the learner talked to Anna on. A lesson on the phone
// AFTER a topic session on the computer made the phone's copy "newer",
// the app kept it and pushed it up, and the topic (or Anna's new memory,
// or a corrected fact) was gone from every device (Nekh 2026-09-26).
//
// tutor.js stamps `tutor.updatedAt` (ms) on every save. Whichever copy has
// the newer stamp supplies the tutor-owned fields, whatever the whole-record
// rule decided. A copy with no stamp (written before this shipped) counts
// as 0, so a stamped copy always wins over it and two unstamped copies
// fall back to the whole-record rule.

export function tutorStamp(user) {
  return Number(user?.tutor?.updatedAt) || 0;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Copies the tutor-owned fields of `source` onto `target` (in place).
// Mirrors the graft tutor.js does when it saves.
export function graftTutorState(target, source) {
  if (!target || !source || typeof target !== "object" || typeof source !== "object") return target;
  if (source.tutor && typeof source.tutor === "object") target.tutor = clone(source.tutor);
  if (Array.isArray(source.learnerFacts)) target.learnerFacts = clone(source.learnerFacts);
  for (const [lang, srcRun] of Object.entries(source.runs || {})) {
    const run = target.runs?.[lang];
    if (!run || typeof run !== "object" || !srcRun || typeof srcRun !== "object") continue;
    run.personalVocab = clone(srcRun.personalVocab || []);
    run.pendingAdmission = clone(srcRun.pendingAdmission || []);
    if (srcRun.tutorVocab) run.tutorVocab = clone(srcRun.tutorVocab);
    // Tutor-admitted concepts join the ladder; app-earned progress on
    // them is never rolled back (only missing entries are filled).
    for (const cid of srcRun.released || []) {
      if (typeof cid !== "string" || !cid.startsWith("TUTOR_")) continue;
      if (!Array.isArray(run.released)) run.released = [];
      if (!run.released.includes(cid)) run.released.push(cid);
      if (srcRun.progress?.[cid]) {
        if (!run.progress || typeof run.progress !== "object") run.progress = {};
        if (!run.progress[cid]) run.progress[cid] = clone(srcRun.progress[cid]);
      }
    }
  }
  return target;
}

// The merge a device runs when the server answers a load. Returns the
// record to use (`user`, null when neither side has one) and whether it
// differs from the server copy and should be pushed up (`pushUp`).
// Whole record: shouldAdoptServerUser. Tutor-owned fields: newer
// tutor.updatedAt wins, grafted onto whichever base was chosen.
export function mergeUserStates(local, server) {
  if (shouldAdoptServerUser(local, server)) {
    if (!server || typeof server !== "object") return { user: null, pushUp: false, grafted: null };
    const user = migrateUserState(server);
    if (local && typeof local === "object" && tutorStamp(local) > tutorStamp(user)) {
      graftTutorState(user, local);
      return { user, pushUp: true, grafted: "local-tutor" };
    }
    return { user, pushUp: false, grafted: null };
  }
  let grafted = null;
  if (server && typeof server === "object" && tutorStamp(server) > tutorStamp(local)) {
    graftTutorState(local, migrateUserState(server));
    grafted = "server-tutor";
  }
  // Local is the newer whole record: it goes up (as before), now carrying
  // the newer tutor state either way.
  return { user: local, pushUp: true, grafted };
}
