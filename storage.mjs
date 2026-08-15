// storage.mjs
// User-state safety: schema versioning, migration, and corruption recovery
// for the persisted `zth_user` blob. Pure functions — app.js owns the actual
// localStorage reads/writes, unit tests exercise the logic directly.

export const CURRENT_SCHEMA_VERSION = 2;

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
