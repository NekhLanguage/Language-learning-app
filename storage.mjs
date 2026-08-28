// storage.mjs
// User-state safety: schema versioning, migration, and corruption recovery
// for the persisted `zth_user` blob. Pure functions — app.js owns the actual
// localStorage reads/writes, unit tests exercise the logic directly.

export const CURRENT_SCHEMA_VERSION = 3;

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
