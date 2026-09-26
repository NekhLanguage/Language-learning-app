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
  shouldAdoptServerUser,
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
  assert.equal(migrated.schemaVersion, 5);
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
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.learnerFacts.length, 1);
  assert.equal(migrated.learnerFacts[0].text, "learner is Norwegian");
});

test("full migration path v0 → v5 stamps every field once", () => {
  const user = validUser();
  const migrated = migrateUserState(user);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.learnerFacts, []);
  assert.deepEqual(migrated.tutor, { prefs: {}, memory: {}, topics: [], topicProposals: [] });
  assert.deepEqual(migrated.runs.pt, { released: [], personalVocab: [], pendingAdmission: [] });
});

test("v3 → v4 seeds the synced tutor store without touching existing prefs", () => {
  const fresh = migrateUserState({ id: "u1", schemaVersion: 3, runs: {}, learnerFacts: [] });
  assert.equal(fresh.schemaVersion, 5);
  assert.deepEqual(fresh.tutor, { prefs: {}, memory: {}, topics: [], topicProposals: [] });

  // A blob written by a newer client that already carries tutor prefs keeps them.
  const kept = migrateUserState({
    id: "u2",
    schemaVersion: 3,
    runs: {},
    learnerFacts: [],
    tutor: { prefs: { no: { challenge: "push", note: "be strict" } } },
  });
  assert.equal(kept.tutor.prefs.no.note, "be strict");
  assert.deepEqual(kept.tutor.memory, {});

  // Running the migration twice is a no-op.
  const again = migrateUserState(JSON.parse(JSON.stringify(kept)));
  assert.deepEqual(again, kept);
});

test("v4 → v5 seeds the topics store and keeps existing tutor state", () => {
  const fresh = migrateUserState({ id: "u1", schemaVersion: 4, runs: {}, learnerFacts: [], tutor: { prefs: {}, memory: {} } });
  assert.equal(fresh.schemaVersion, 5);
  assert.deepEqual(fresh.tutor.topics, []);
  assert.deepEqual(fresh.tutor.topicProposals, []);

  // A v4 blob with no tutor field at all still gets one.
  const bare = migrateUserState({ id: "u2", schemaVersion: 4, runs: {}, learnerFacts: [] });
  assert.deepEqual(bare.tutor.topics, []);

  // Topics already written (a newer client) survive, and a rerun is a no-op.
  const kept = migrateUserState({
    id: "u3",
    schemaVersion: 4,
    runs: {},
    learnerFacts: [],
    tutor: { prefs: { no: { note: "x" } }, memory: {}, topics: [{ id: "t_1", name: "One Piece" }] },
  });
  assert.equal(kept.tutor.topics[0].name, "One Piece");
  assert.equal(kept.tutor.prefs.no.note, "x");
  assert.deepEqual(migrateUserState(JSON.parse(JSON.stringify(kept))), kept);
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

// ── shouldAdoptServerUser (Emi 2026-09-02-55) ────────────────────────────
const withRuns = (lastLocalChange) => ({
  id: "u1", lastLocalChange, runs: { pt: { released: ["EAT"] } },
});

test("adopt guard: no server copy keeps local", () => {
  assert.equal(shouldAdoptServerUser(withRuns(200), null), false);
  assert.equal(shouldAdoptServerUser(withRuns(200), undefined), false);
});

test("adopt guard: a fresh device (no local runs) takes the server copy", () => {
  assert.equal(shouldAdoptServerUser({ id: "u0", runs: {} , lastLocalChange: 999 }, withRuns(100)), true);
  assert.equal(shouldAdoptServerUser(null, withRuns(100)), true);
});

test("adopt guard: a newer local copy is kept over a stale server copy", () => {
  // The run-12 scenario: server stuck at an old save, local has two runs
  // of progress since — the old path adopted the server and lost them.
  assert.equal(shouldAdoptServerUser(withRuns(200), withRuns(100)), false);
});

test("adopt guard: a newer or equal server copy is adopted (post-save read-back, second device)", () => {
  assert.equal(shouldAdoptServerUser(withRuns(100), withRuns(100)), true);
  assert.equal(shouldAdoptServerUser(withRuns(100), withRuns(300)), true);
  // A local copy that never stamped a change defers to the server.
  assert.equal(shouldAdoptServerUser({ runs: { pt: {} } }, withRuns(1)), true);
});

test("adopt guard: a null server copy never replaces local runs (Emi 2026-09-02-61)", () => {
  assert.equal(shouldAdoptServerUser(withRuns(100), null), false);
  // …but a device with nothing local may start fresh from it.
  assert.equal(shouldAdoptServerUser({ runs: {} }, null), true);
});

// Field-level merge for Anna's state (Nekh 2026-09-26): the whole record
// follows the newest save, the tutor-owned fields follow tutor.updatedAt.
import { mergeUserStates, graftTutorState, tutorStamp } from "../../storage.mjs";

function device({ change, tutorAt, topics = [], vocab = [], released = [], facts = [] }) {
  return {
    id: "u1", schemaVersion: 5, supportLanguage: "en", lastLocalChange: change,
    runs: { pt: { released, progress: {}, personalVocab: vocab, pendingAdmission: [] } },
    learnerFacts: facts,
    tutor: { prefs: {}, memory: {}, topics, topicProposals: [], ...(tutorAt ? { updatedAt: tutorAt } : {}) },
  };
}

test("mergeUserStates: a newer lesson on this device no longer erases a topic made on another", () => {
  // Computer: topic session at t=100 (tutor stamped), synced to the server.
  const server = device({ change: 100, tutorAt: 100, topics: [{ id: "t_1", name: "Rave Master" }], vocab: [{ word: "navio" }], released: ["TUTOR_NAVIO"], facts: [{ text: "reads manga" }] });
  server.runs.pt.progress.TUTOR_NAVIO = { level: 1 };
  // Phone: did a lesson at t=200, never talked to Anna (no stamp, no topic).
  const phone = device({ change: 200, released: ["WATER"] });
  const { user, pushUp, grafted } = mergeUserStates(phone, server);
  assert.equal(user, phone, "the phone's newer run progress is the base");
  assert.equal(grafted, "server-tutor");
  assert.equal(pushUp, true);
  assert.deepEqual(user.tutor.topics, [{ id: "t_1", name: "Rave Master" }]);
  assert.equal(user.tutor.updatedAt, 100);
  assert.deepEqual(user.learnerFacts, [{ text: "reads manga" }]);
  assert.deepEqual(user.runs.pt.personalVocab, [{ word: "navio" }]);
  assert.deepEqual(user.runs.pt.released, ["WATER", "TUTOR_NAVIO"], "tutor-admitted concept joins the phone's ladder");
  assert.deepEqual(user.runs.pt.progress.TUTOR_NAVIO, { level: 1 });
});

test("mergeUserStates: server base keeps this device's newer Anna state and pushes it up", () => {
  // Server: phone's lesson at t=300. Local: computer talked to Anna at
  // t=250 but that save never reached the server (sync failed).
  const server = device({ change: 300 });
  const local = device({ change: 250, tutorAt: 250, topics: [{ id: "t_2", name: "Cooking" }] });
  const { user, pushUp, grafted } = mergeUserStates(local, server);
  assert.notEqual(user, local);
  assert.equal(user.lastLocalChange, 300);
  assert.equal(grafted, "local-tutor");
  assert.equal(pushUp, true);
  assert.deepEqual(user.tutor.topics, [{ id: "t_2", name: "Cooking" }]);
});

test("mergeUserStates: with no tutor stamps the whole-record rule decides, unchanged", () => {
  const server = device({ change: 100, topics: [{ id: "t_1", name: "old" }] });
  const local = device({ change: 200 });
  const a = mergeUserStates(local, server);
  assert.equal(a.user, local); assert.equal(a.grafted, null); assert.deepEqual(a.user.tutor.topics, []);
  const b = mergeUserStates(device({ change: 50 }), server);
  assert.equal(b.user.lastLocalChange, 100); assert.equal(b.grafted, null); assert.equal(b.pushUp, false);
  // Nothing anywhere.
  assert.deepEqual(mergeUserStates(null, null), { user: null, pushUp: false, grafted: null });
  // Local has runs, server has nothing: keep local (unchanged rule).
  assert.equal(mergeUserStates(local, null).user, local);
});

test("mergeUserStates: an older device without the stamp never beats a stamped copy", () => {
  const stamped = device({ change: 100, tutorAt: 100, topics: [{ id: "t_1", name: "Rave Master" }] });
  const unstamped = device({ change: 999 });
  assert.equal(tutorStamp(unstamped), 0);
  assert.deepEqual(mergeUserStates(unstamped, stamped).user.tutor.topics, [{ id: "t_1", name: "Rave Master" }]);
  assert.deepEqual(mergeUserStates(stamped, unstamped).user.tutor.topics, [{ id: "t_1", name: "Rave Master" }]);
});

test("graftTutorState copies, never aliases, and skips runs the target lacks", () => {
  const src = device({ change: 1, tutorAt: 1, topics: [{ id: "t", name: "x" }] });
  src.runs.uk = { released: ["TUTOR_A"], progress: {}, personalVocab: [{ word: "a" }], pendingAdmission: [] };
  const tgt = device({ change: 2 });
  graftTutorState(tgt, src);
  assert.notEqual(tgt.tutor, src.tutor);
  assert.deepEqual(tgt.tutor.topics, src.tutor.topics);
  assert.equal(tgt.runs.uk, undefined);
});
