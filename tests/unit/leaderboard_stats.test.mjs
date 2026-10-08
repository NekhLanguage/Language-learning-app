// Leaderboard v1: the two counters and the display-name rule
// (netlify/functions/leaderboardStats.js). The counters are what saveUser
// stores on every save, so what they count is the contract.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MAX_LEVEL } from "../../progression.mjs";

const require = createRequire(import.meta.url);
const stats = require("../../netlify/functions/leaderboardStats.js");

const p = (level, completed, extra = {}) => ({ level, streak: 0, completed, lastShownAt: 3, lastResult: true, provenance: "pack", admittedFrom: null, ...extra });

test("MASTERY_LEVEL mirrors progression.mjs MAX_LEVEL", () => {
  assert.equal(stats.MASTERY_LEVEL, MAX_LEVEL);
});

test("words mastered: completed at level 7, across runs; recognition (L4) and unfinished L7 never count", () => {
  const user = {
    runs: {
      uk: {
        progress: {
          WATER: p(7, true),
          BOOK: p(7, false),          // at the top but not yet passed
          HELLO: p(4, true),          // recognition-only cap
          FOOD: p(6, true),           // can't happen, but must not count
          DRINK: p(7, true, { provenance: "tutor" }),
        },
      },
      es: { progress: { EAT: p(7, true) } },
      broken: null,
      noProgress: {},
    },
  };
  assert.equal(stats.countMasteredWords(user), 3);
});

test("words with Anna: tutor-admitted concepts plus captured and pending words, across runs", () => {
  const user = {
    runs: {
      uk: {
        progress: {
          WATER: p(7, true),
          TUTOR_KAVA: p(2, false, { provenance: "tutor", admittedFrom: "tutor" }),
          TUTOR_CHAI: p(7, true, { provenance: "tutor", admittedFrom: "tutor" }),
        },
        personalVocab: [{ word: "вікно" }, { word: "двері" }],
        pendingAdmission: [{ word: "стіл" }],
      },
      es: { progress: {}, personalVocab: [{ word: "mesa" }] },
      pt: { progress: {} },
    },
  };
  assert.equal(stats.countAnnaWords(user), 6);
});

test("computeLeaderboardStats is zero-safe on empty, malformed and null blobs", () => {
  for (const blob of [null, undefined, 42, "x", {}, { runs: null }, { runs: [] }, { runs: { uk: 7 } }, { runs: { uk: { progress: "no", personalVocab: "no" } } }]) {
    assert.deepEqual(stats.computeLeaderboardStats(blob), { words: 0, anna: 0 }, JSON.stringify(blob));
  }
});

test("normalizeDisplayName: trims, collapses whitespace, keeps any script, refuses markup and bad lengths", () => {
  assert.equal(stats.normalizeDisplayName("  Nekh  "), "Nekh");
  assert.equal(stats.normalizeDisplayName("Nekh\tthe   Great"), "Nekh the Great");
  assert.equal(stats.normalizeDisplayName("Ольга"), "Ольга");
  assert.equal(stats.normalizeDisplayName("ゆき"), "ゆき");
  assert.equal(stats.normalizeDisplayName("Na\u0000me​"), "Name");
  assert.equal(stats.normalizeDisplayName("x"), null, "too short");
  assert.equal(stats.normalizeDisplayName("a".repeat(stats.MAX_NAME + 1)), null, "too long");
  assert.equal(stats.normalizeDisplayName("a".repeat(stats.MAX_NAME)), "a".repeat(stats.MAX_NAME));
  assert.equal(stats.normalizeDisplayName("<b>hi</b>"), null, "markup");
  assert.equal(stats.normalizeDisplayName("Tom & Jerry"), null, "ampersand");
  assert.equal(stats.normalizeDisplayName("O'Brien"), null, "quote");
  assert.equal(stats.normalizeDisplayName("   "), null);
  assert.equal(stats.normalizeDisplayName(null), null);
  assert.equal(stats.normalizeDisplayName(123), null);
});

// The weekly board filters on this key; the users_lb_weekly trigger stamps
// lb_week with Postgres's to_char(…, 'IYYY-"W"IW'). The two must agree,
// including the ISO-year edges (2026-10-08 is what Postgres returned).
test("isoWeekKey: ISO weeks in UTC, matching the trigger's Postgres key", () => {
  assert.equal(stats.isoWeekKey(new Date("2026-10-08T17:00:00Z")), "2026-W41");
  assert.equal(stats.isoWeekKey(new Date("2026-10-05T00:00:00Z")), "2026-W41", "Monday 00:00 UTC opens the week");
  assert.equal(stats.isoWeekKey(new Date("2026-10-04T23:59:59Z")), "2026-W40", "Sunday night is still last week");
  assert.equal(stats.isoWeekKey(new Date("2021-01-03T12:00:00Z")), "2020-W53", "early January can belong to last year's week 53");
  assert.equal(stats.isoWeekKey(new Date("2024-12-30T12:00:00Z")), "2025-W01", "late December can belong to next year's week 1");
  assert.equal(stats.isoWeekKey(new Date("2026-01-01T00:00:00Z")), "2026-W01");
});
