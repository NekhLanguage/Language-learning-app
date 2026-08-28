// Unit tests for user-state safety (storage.mjs): schema stamping/migration
// and corruption recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_SCHEMA_VERSION,
  migrateUserState,
  recoverUser,
  isDefaultTemplateProgress,
  compactUserForPersist,
} from "../../storage.mjs";

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

// Emi 2026-08-28-22: 690 of 794 templateProgress rows across 10 languages
// carried defaults and pushed the saved USER blob to 236 KB, driving
// loadUser to a 504. Compact on persist; rehydrate on demand.
test("isDefaultTemplateProgress accepts the two persisted-default shapes", () => {
  // In-memory default (freshly created by ensureTemplateProgress).
  assert.equal(isDefaultTemplateProgress({
    streak: 0, reinforcementStage: 0, completed: false,
    lastShownAt: -Infinity, lastResult: null,
  }), true);
  // After a save/load round-trip, -Infinity comes back as null.
  assert.equal(isDefaultTemplateProgress({
    streak: 0, reinforcementStage: 0, completed: false,
    lastShownAt: null, lastResult: null,
  }), true);
});

test("isDefaultTemplateProgress rejects any user-touched row", () => {
  const cases = [
    { streak: 1, reinforcementStage: 0, completed: false, lastShownAt: null, lastResult: null },
    { streak: 0, reinforcementStage: 1, completed: false, lastShownAt: null, lastResult: null },
    { streak: 0, reinforcementStage: 0, completed: true,  lastShownAt: null, lastResult: null },
    { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: 42,   lastResult: null },
    { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: null, lastResult: true },
    // Extra keys mean the row carries data outside the known-default set —
    // never drop it.
    { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: null, lastResult: null, extra: 1 },
    // Missing keys mean an older shape we don't understand — don't drop.
    { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: null },
  ];
  for (const row of cases) {
    assert.equal(isDefaultTemplateProgress(row), false, `should reject ${JSON.stringify(row)}`);
  }
});

test("isDefaultTemplateProgress is null/undefined/primitive-safe", () => {
  for (const v of [null, undefined, 0, "", true, []]) {
    assert.equal(isDefaultTemplateProgress(v), false);
  }
});

test("compactUserForPersist drops default rows and keeps touched ones", () => {
  const user = {
    id: "u1",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    runs: {
      pl: {
        released: ["A", "B", "C"],
        templateProgress: {
          T_UNTOUCHED_1: { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: -Infinity, lastResult: null },
          T_UNTOUCHED_2: { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: null, lastResult: null },
          T_ACTIVE: { streak: 3, reinforcementStage: 1, completed: false, lastShownAt: 42, lastResult: true },
          T_COMPLETED: { streak: 0, reinforcementStage: 0, completed: true, lastShownAt: 99, lastResult: true },
        },
      },
      uk: {
        released: [],
        templateProgress: {
          T_X: { streak: 0, reinforcementStage: 0, completed: false, lastShownAt: null, lastResult: null },
        },
      },
    },
  };

  const compact = compactUserForPersist(user);

  // Touched rows survive; other run fields untouched.
  assert.deepEqual(Object.keys(compact.runs.pl.templateProgress).sort(),
    ["T_ACTIVE", "T_COMPLETED"]);
  assert.deepEqual(compact.runs.pl.released, ["A", "B", "C"]);
  // Run with only default rows compacts to {}.
  assert.deepEqual(compact.runs.uk.templateProgress, {});

  // The original object is not mutated — the live app keeps every rehydrated row.
  assert.equal(Object.keys(user.runs.pl.templateProgress).length, 4);
  assert.equal(user.runs.uk.templateProgress.T_X.streak, 0);
});

test("compactUserForPersist is safe on empty / missing structures", () => {
  assert.deepEqual(compactUserForPersist(null), null);
  assert.deepEqual(compactUserForPersist({}), {});
  const noRuns = { id: "u", schemaVersion: 3 };
  assert.deepEqual(compactUserForPersist(noRuns), noRuns);
  const runsNoTP = { id: "u", schemaVersion: 3, runs: { pt: { released: [] } } };
  const out = compactUserForPersist(runsNoTP);
  assert.deepEqual(out.runs.pt, { released: [] });
});
