// storage.mjs
// User-state safety: schema versioning, migration, and corruption recovery
// for the persisted `zth_user` blob. Pure functions — app.js owns the actual
// localStorage reads/writes, unit tests exercise the logic directly.

export const CURRENT_SCHEMA_VERSION = 3;

export const USER_KEY = "zth_user";
export const USER_BACKUP_KEY = "zth_user_backup";

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

// The fields of the default templateProgress row ensureTemplateProgress()
// creates on demand. A row still equal to the default carries no
// information — 690 of 794 rows (73 KB of an 84 KB templateProgress) were
// exactly this on a real account, and the record grew past the Supabase
// loadUser timeout (Emi 2026-08-28-22).
const TEMPLATE_PROGRESS_DEFAULT_KEYS = new Set([
  "streak", "reinforcementStage", "completed", "lastShownAt", "lastResult",
]);

export function isDefaultTemplateProgress(p) {
  if (!p || typeof p !== "object") return false;
  return (p.streak || 0) === 0 &&
    (p.reinforcementStage || 0) === 0 &&
    !p.completed &&
    (p.lastResult ?? null) === null &&
    // Live rows hold -Infinity, persisted rows null (JSON has no Infinity).
    (p.lastShownAt == null || p.lastShownAt === -Infinity) &&
    // A row carrying any key this check doesn't know is NOT default — a
    // future field can never be silently dropped by this compaction.
    Object.keys(p).every((k) => TEMPLATE_PROGRESS_DEFAULT_KEYS.has(k));
}

// Serialization-time compaction: drop templateProgress rows equal to the
// default. ensureTemplateProgress() recreates a missing row on demand, so
// absence and default are the same state — no behaviour change, a third
// of the saved record gone. Returns a copy; never mutates the live USER.
export function compactUserState(user) {
  if (!user || typeof user !== "object" || !user.runs) return user;
  const out = { ...user, runs: {} };
  for (const [lang, run] of Object.entries(user.runs)) {
    if (!run || typeof run !== "object" || !run.templateProgress) {
      out.runs[lang] = run;
      continue;
    }
    const tp = {};
    for (const [id, p] of Object.entries(run.templateProgress)) {
      if (!isDefaultTemplateProgress(p)) tp[id] = p;
    }
    out.runs[lang] = { ...run, templateProgress: tp };
  }
  return out;
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
