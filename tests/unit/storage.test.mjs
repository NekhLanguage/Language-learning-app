// Unit tests for user-state safety (storage.mjs): schema stamping/migration
// and corruption recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, migrateUserState, recoverUser } from "../../storage.mjs";

const validUser = () => ({ id: "u1", supportLanguage: "en", runs: { pt: { released: [] } } });

test("migrateUserState stamps pre-versioning blobs", () => {
  const user = validUser();
  assert.equal(user.schemaVersion, undefined);
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  // Data untouched.
  assert.deepEqual(migrated.runs, { pt: { released: [] } });
});

test("migrateUserState leaves current-version blobs alone", () => {
  const user = { ...validUser(), schemaVersion: CURRENT_SCHEMA_VERSION };
  assert.equal(migrateUserState(user).schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("recoverUser parses a healthy primary blob", () => {
  const { user, source } = recoverUser(JSON.stringify(validUser()), null);
  assert.equal(source, "primary");
  assert.equal(user.id, "u1");
  assert.equal(user.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("recoverUser falls back to the backup when the primary is corrupt", () => {
  const backup = JSON.stringify({ ...validUser(), id: "from-backup" });
  for (const corrupt of ["{not json", '"a string"', "null", JSON.stringify({ noRuns: true })]) {
    const { user, source } = recoverUser(corrupt, backup);
    assert.equal(source, "backup", `primary=${corrupt}`);
    assert.equal(user.id, "from-backup");
  }
});

test("recoverUser returns null when nothing is recoverable", () => {
  assert.deepEqual(recoverUser("{oops", "{also oops"), { user: null, source: null });
  assert.deepEqual(recoverUser(null, null), { user: null, source: null });
});
