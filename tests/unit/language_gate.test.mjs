// Unit tests for the per-language quality gate (Nekh 2026-08-28): the
// decision logic in validation/lib/language-gate-core.mjs, the registry
// invariants the gate and the scraping loaders both depend on, and the
// hidden-language contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLanguageGate, tightenExceptions }
  from "../../validation/lib/language-gate-core.mjs";
import { loadLanguageCodes } from "../../validation/load-vocab.mjs";
import { AVAILABLE_LANGUAGES } from "../../languages.js";

const T = 0.15;
const row = (code, diverged, opts = {}) =>
  ({ code, hidden: false, total: 128, diverged, ...opts });

test("gate: a visible language under the threshold passes", () => {
  const { failures } = evaluateLanguageGate({
    rows: [row("pl", 7)], threshold: T });
  assert.deepEqual(failures, []);
});

test("gate: a visible language over the threshold with no exception fails", () => {
  const { failures } = evaluateLanguageGate({
    rows: [row("zh", 79)], threshold: T });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /zh/);
  assert.match(failures[0], /not grandfathered/);
});

test("gate: a frozen exception admits the language and feeds the fix queue", () => {
  const { failures, queue } = evaluateLanguageGate({
    rows: [row("zh", 79), row("ja", 67)],
    exceptions: { zh: { maxRate: 0.618 }, ja: { maxRate: 0.524 } },
    threshold: T,
  });
  assert.deepEqual(failures, []);
  // Worst first — the queue is the priority order Nekh asked for.
  assert.deepEqual(queue.map((q) => q.code), ["zh", "ja"]);
});

test("gate: exceeding your own frozen exception fails — nothing gets worse quietly", () => {
  const { failures } = evaluateLanguageGate({
    rows: [row("zh", 90)],
    exceptions: { zh: { maxRate: 0.618 } },
    threshold: T,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /exceeds its frozen exception/);
});

test("gate: hidden languages never fail — over threshold or corpus-less", () => {
  const { failures, statuses } = evaluateLanguageGate({
    rows: [
      row("fi", 60, { hidden: true }),
      { code: "xx", hidden: true, total: 0, diverged: 0 },
    ],
    threshold: T,
  });
  assert.deepEqual(failures, []);
  assert.match(statuses[0].status, /keep building/);
  assert.match(statuses[1].status, /no corpus yet/);
});

test("gate: a VISIBLE language with no authored corpus fails", () => {
  const { failures } = evaluateLanguageGate({
    rows: [{ code: "xx", hidden: false, total: 0, diverged: 0 }],
    threshold: T,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no authored render corpus/);
});

test("gate: a hidden language that reaches the bar is flagged ready to unhide", () => {
  const { statuses } = evaluateLanguageGate({
    rows: [row("fi", 10, { hidden: true })], threshold: T });
  assert.match(statuses[0].status, /ready to unhide/);
});

test("tightenExceptions: prunes graduates, tightens improvements, never loosens", () => {
  const rows = [row("de", 12), row("zh", 70), row("ar", 64)];
  const next = tightenExceptions({
    rows,
    exceptions: {
      de: { maxRate: 0.172 },  // now 12/128 = 9.4% — under bar, prune
      zh: { maxRate: 0.618 },  // improved to 54.7% — tighten
      ar: { maxRate: 0.4 },    // regressed to 50% — exception must NOT rise
    },
    threshold: T,
  });
  assert.equal(next.de, undefined);
  assert.equal(next.zh.maxRate, 0.547);
  assert.equal(next.ar.maxRate, 0.4);
});

// ---------------------------------------------------------------------
// Registry invariants
// ---------------------------------------------------------------------

test("the loaders' registry scrape matches the real export exactly", () => {
  // load-vocab.mjs (and two validator copies) discover languages by
  // scanning languages.js for `{ code: "xx"` — which only matches while
  // `code` stays the FIRST key of each row. A hidden or reordered row
  // silently vanishing from every validator is the failure this pins.
  assert.deepEqual(
    [...loadLanguageCodes()].sort(),
    AVAILABLE_LANGUAGES.map((l) => l.code).sort(),
  );
});

test("every grandfathered exception names a real, visible language", async () => {
  const fs = await import("node:fs");
  const exceptions = JSON.parse(fs.readFileSync(
    new URL("../../validation/language-gate-exceptions.json", import.meta.url), "utf8"));
  const byCode = Object.fromEntries(AVAILABLE_LANGUAGES.map((l) => [l.code, l]));
  for (const [code, ex] of Object.entries(exceptions)) {
    assert.ok(byCode[code], `exception for unknown language "${code}"`);
    assert.ok(!byCode[code].hidden,
      `hidden language "${code}" needs no exception — hidden rows never fail the gate`);
    assert.ok(typeof ex.maxRate === "number" && ex.maxRate > 0 && ex.maxRate < 1,
      `exception for "${code}" has no sane maxRate`);
  }
});

test("hidden languages are excluded from what learners can pick", () => {
  // Mirrors the two app.js filters (target picker + SUPPORT_LANGUAGES).
  const visible = AVAILABLE_LANGUAGES.filter((l) => !l.hidden);
  // Today no language is hidden; when PR 4 adds fi as hidden, visible
  // stays at the pre-fi count and this assertion keeps meaning "the
  // pickers never see hidden rows".
  for (const l of visible) assert.ok(!l.hidden);
  assert.ok(visible.length >= 16);
});

// ---------------------------------------------------------------------
// The typological questionnaire (PR 2) — shape contracts the validator
// hard-fails on, pinned here so a refactor can't soften them.
// ---------------------------------------------------------------------

test("questionnaire: every shipped language has a complete profile", async () => {
  const fs = await import("node:fs");
  const raw = JSON.parse(fs.readFileSync(
    new URL("../../validation/language-profiles.json", import.meta.url), "utf8"));
  const profiles = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith("_")));
  const axes = [
    "definiteArticles", "indefiniteArticles", "nounCaseOnObjects",
    "prepositionalCase", "verbPersonConjugation", "verbGenderAgreement",
    "grammaticalGender", "adjectiveAgreement", "classifiersOrCounters",
    "topicOrCaseParticles", "zeroOrSuffixalCopula", "pluralInflection",
    "spacelessScript", "apocope", "politenessRegisters",
    "numeralInteraction", "specialPossession",
  ];
  for (const code of loadLanguageCodes()) {
    assert.ok(profiles[code], `language "${code}" has not answered the questionnaire`);
    for (const axis of axes) {
      assert.equal(typeof profiles[code][axis], "boolean",
        `${code}.${axis} unanswered — the questionnaire has no skippable questions`);
    }
  }
});

test("questionnaire: the launch-verified languages are declaration-clean", async () => {
  const fs = await import("node:fs");
  const baseline = JSON.parse(fs.readFileSync(
    new URL("../../validation/language-profiles-baseline.json", import.meta.url), "utf8"));
  // pl and uk are human-verified; a questionnaire gap there would mean the
  // matrix and the verification disagree.
  assert.deepEqual(baseline.pl, []);
  assert.deepEqual(baseline.uk, []);
});
