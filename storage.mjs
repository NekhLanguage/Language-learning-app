// storage.mjs
// User-state safety: schema versioning, migration, and corruption recovery
// for the persisted `zth_user` blob. Pure functions — app.js owns the actual
// localStorage reads/writes, unit tests exercise the logic directly.

export const CURRENT_SCHEMA_VERSION = 1;

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
