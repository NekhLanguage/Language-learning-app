// Unit tests for user-state safety (storage.mjs): schema stamping/migration
// and corruption recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, migrateUserState, recoverUser,
  isDefaultTemplateProgress, compactUserState } from "../../storage.mjs";

const validUser = () => ({ id: "u1", supportLanguage: "en", runs: { pt: { released: [] } } });

test("migrateUserState stamps pre-versioning blobs", () => {
  const user = validUser();
  assert.equal(user.schemaVersion, undefined);
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  // Pre-existing data untouched; v2 seeds the tutor-vocab containers.
  assert.deepEqual(migrated.runs, {
    pt: { released: [], personalVocab: [], pendingAdmission: [] },
  });
});

test("migrateUserState leaves current-version blobs alone", () => {
  const user = { ...validUser(), schemaVersion: CURRENT_SCHEMA_VERSION };
  assert.equal(migrateUserState(user).schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("v1 → v2 stamps provenance on every progress entry and preserves the rest", () => {
  const user = {
    id: "u1",
    schemaVersion: 1,
    supportLanguage: "en",
    runs: {
      uk: {
        released: ["WATER", "HOUSE"],
        progress: {
          WATER: { level: 4, streak: 2, completed: false, lastShownAt: 10, lastResult: true },
          HOUSE: { level: 7, streak: 0, completed: true, lastShownAt: 3, lastResult: null },
        },
      },
    },
  };
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  for (const cid of ["WATER", "HOUSE"]) {
    assert.equal(migrated.runs.uk.progress[cid].provenance, "pack");
    assert.equal(migrated.runs.uk.progress[cid].admittedFrom, null);
  }
  // Existing progress fields preserved.
  assert.equal(migrated.runs.uk.progress.WATER.level, 4);
  assert.equal(migrated.runs.uk.progress.WATER.streak, 2);
  assert.equal(migrated.runs.uk.progress.HOUSE.completed, true);
  // Tutor-vocab containers seeded on the run.
  assert.deepEqual(migrated.runs.uk.personalVocab, []);
  assert.deepEqual(migrated.runs.uk.pendingAdmission, []);
});

test("v1 → v2 is null-safe on runs without progress", () => {
  const user = { id: "u1", schemaVersion: 1, runs: { pt: {}, es: null } };
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.runs.pt.personalVocab, []);
  assert.deepEqual(migrated.runs.pt.pendingAdmission, []);
  assert.equal(migrated.runs.es, null);
});

test("v1 → v2 is idempotent and never downgrades tutor provenance", () => {
  const user = {
    id: "u1",
    schemaVersion: 1,
    runs: {
      pt: {
        progress: {
          TUTOR_MERCADO: {
            level: 1, streak: 0, completed: false, lastShownAt: -Infinity, lastResult: null,
            provenance: "tutor",
            admittedFrom: { mode: "tutor", sessionDate: "2026-08-10" },
          },
        },
        personalVocab: [{ word: "praia", translation: "beach", note: "" }],
        pendingAdmission: [],
      },
    },
  };
  const once = migrateUserState(user);
  const twice = migrateUserState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(JSON.parse(JSON.stringify(twice)), JSON.parse(JSON.stringify(once)));
  // A provenance already set (e.g. by a newer device) is never overwritten.
  assert.equal(once.runs.pt.progress.TUTOR_MERCADO.provenance, "tutor");
  assert.deepEqual(once.runs.pt.progress.TUTOR_MERCADO.admittedFrom, { mode: "tutor", sessionDate: "2026-08-10" });
  // An existing personalVocab list is kept, not re-seeded.
  assert.equal(once.runs.pt.personalVocab.length, 1);
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

test("v2 → v3 seeds an empty user-level learnerFacts array", () => {
  const user = {
    id: "u1",
    schemaVersion: 2,
    supportLanguage: "en",
    runs: { pt: { released: [], personalVocab: [], pendingAdmission: [] } },
  };
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.learnerFacts, []);
  // Existing run-level state is untouched.
  assert.deepEqual(migrated.runs.pt, { released: [], personalVocab: [], pendingAdmission: [] });
});

test("v2 → v3 preserves an already-populated learnerFacts", () => {
  const user = {
    id: "u1",
    schemaVersion: 2,
    runs: {},
    learnerFacts: [{ text: "learner is Norwegian", source: "tutor", addedAt: "2026-08-16" }],
  };
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.learnerFacts.length, 1);
  assert.equal(migrated.learnerFacts[0].text, "learner is Norwegian");
});

test("full migration path v0 → v3 stamps every field once", () => {
  const user = validUser();
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.learnerFacts, []);
  assert.deepEqual(migrated.runs.pt, { released: [], personalVocab: [], pendingAdmission: [] });
});

// ---------------------------------------------------------------------
// Serialization-time compaction (Emi 2026-08-28-22): default
// templateProgress rows are dropped — 690 of 794 rows on a real account
// carried every field at its default, 73 KB of dead weight that pushed
// Supabase loadUser past its timeout.
// ---------------------------------------------------------------------

const DEFAULT_ROW = () => ({
  streak: 0, reinforcementStage: 0, completed: false,
  lastShownAt: null, lastResult: null,
});

test("isDefaultTemplateProgress: default rows, live and persisted shape", () => {
  assert.equal(isDefaultTemplateProgress(DEFAULT_ROW()), true);
  // The live in-memory row holds -Infinity where JSON persists null.
  assert.equal(isDefaultTemplateProgress(
    { ...DEFAULT_ROW(), lastShownAt: -Infinity }), true);
});

test("isDefaultTemplateProgress: any real signal keeps the row", () => {
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), streak: 1 }), false);
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), reinforcementStage: 2 }), false);
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), completed: true }), false);
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), lastShownAt: 41 }), false);
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), lastResult: "correct" }), false);
  // lastShownAt: 0 is a real sighting (exercise counter starts at 0).
  assert.equal(isDefaultTemplateProgress({ ...DEFAULT_ROW(), lastShownAt: 0 }), false);
});

test("isDefaultTemplateProgress: a row with an unknown field is never dropped", () => {
  // A future field this check doesn't know about must not be silently
  // discarded by the compaction.
  assert.equal(isDefaultTemplateProgress(
    { ...DEFAULT_ROW(), someFutureField: 0 }), false);
});

test("compactUserState drops default rows and keeps everything else", () => {
  const user = {
    id: "u1", schemaVersion: CURRENT_SCHEMA_VERSION,
    runs: {
      pl: {
        released: ["WATER"],
        templateProgress: {
          T_DEFAULT: DEFAULT_ROW(),
          T_SEEN: { ...DEFAULT_ROW(), lastShownAt: 12 },
          T_DONE: { ...DEFAULT_ROW(), completed: true, streak: 3 },
        },
      },
      uk: { released: [] }, // run without templateProgress survives as-is
    },
  };
  const compact = compactUserState(user);
  assert.deepEqual(Object.keys(compact.runs.pl.templateProgress).sort(),
    ["T_DONE", "T_SEEN"]);
  assert.deepEqual(compact.runs.uk, { released: [] });
  // Never mutates the live USER object.
  assert.equal(Object.keys(user.runs.pl.templateProgress).length, 3);
  // The kept rows are the same data.
  assert.deepEqual(compact.runs.pl.templateProgress.T_DONE,
    user.runs.pl.templateProgress.T_DONE);
});

test("compactUserState round-trips through JSON like the save path does", () => {
  const user = {
    id: "u1", runs: { pl: { templateProgress: { A: DEFAULT_ROW(),
      B: { ...DEFAULT_ROW(), streak: 2 } } } },
  };
  const persisted = JSON.parse(JSON.stringify(compactUserState(user)));
  assert.deepEqual(Object.keys(persisted.runs.pl.templateProgress), ["B"]);
});
