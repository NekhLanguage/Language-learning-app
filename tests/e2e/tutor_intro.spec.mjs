// Tutor-admitted concepts render an L1 intro card seeded from
// run.tutorVocab (no template, no GLOBAL_VOCAB entry), then advance to L2
// where renderTutorRecognition takes over: a 4-option MCQ built from the
// tutor entry's translation + pack-sourced distractors. Two correct L2
// answers hit TUTOR_MVP_LEVEL_CAP and mark the concept completed — no L3+
// renderer exists for tutor cids yet.

import { test, expect, startNewRun } from "./fixtures.mjs";

// Release enough bundles for pack distractors to exist, retire them so
// chooseConcept lands on the tutor cid we seed, then add the tutor entry
// at L1.
async function seedOneTutorConcept(page, cid, entry, { bundles = 6 } = {}) {
  await page.evaluate(({ cid, entry, bundles }) => {
    const app = window.__app;
    const run = app.run;
    const index = app.bundleIndex;

    const bundleIds = run.releasePlan.slice(0, bundles);
    run.releasedBundleIds = bundleIds;
    run.releasePlanIndex = bundleIds.length;
    run.released = [...new Set(bundleIds.flatMap((id) => index[id]?.concepts || []))];

    run.progress = {};
    for (const c of run.released) {
      run.progress[c] = {
        level: 7, streak: 0, completed: true,
        lastShownAt: -999999, lastResult: null,
        provenance: "pack", admittedFrom: null,
      };
    }

    run.tutorVocab = run.tutorVocab || {};
    run.tutorVocab[cid] = entry;
    run.released.push(cid);
    run.progress[cid] = {
      level: 1, streak: 0, completed: false,
      lastShownAt: -999999, lastResult: null,
      provenance: "tutor",
      admittedFrom: { mode: "tutor", sessionDate: "2026-08-15" },
    };

    run.templateProgress = {};
    run.exerciseCounter = 0;
    run.recentTemplates = [];
    run.sessionLevelUps = {};
    run.sessionAttempts = {};
    run.sessionExerciseCount = 0;
    run.sessionComplete = false;
    app.rerender();
  }, { cid, entry, bundles });
}

test("L1 tutor intro card renders from run.tutorVocab", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_TESTWORD", {
    word: "testword",
    translation: "testword-en",
    note: "A word introduced by Anna during a tutor session.",
    pos: "noun",
  });

  await expect(page.locator(".tutor-intro-badge")).toBeVisible();
  await expect(page.locator(".tutor-intro-badge")).toContainText("Anna");
  await expect(page.locator("#content h2")).toContainText("Testword");
  await expect(page.locator(".word-note")).toContainText("Anna");
  await expect(page.locator("#continue-btn")).toBeVisible();

  const cid = await page.evaluate(() => window.__app.run.lastTargetConcept);
  expect(cid).toBe("TUTOR_TESTWORD");
});

test("intro card renders with translation and no note when note is empty", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_NONOTE", {
    word: "nonoteword",
    translation: "nonoteword-en",
    note: "",
    pos: "noun",
  });

  await expect(page.locator(".tutor-intro-badge")).toBeVisible();
  await expect(page.locator("#content h2")).toContainText("Nonoteword");
  await expect(page.locator("#content p").first()).toContainText("Nonoteword-en");
  await expect(page.locator(".word-note")).toHaveCount(0);
});

test("canConceptBeTested returns false for a tutor concept at L3 without a template", async ({ page }) => {
  await startNewRun(page);

  // The MVP cap keeps tutor concepts from ever reaching L3 in real runs, but
  // if a stale blob or a manual state override lands one there,
  // canConceptBeTested must still filter it out — the L3+ renderers all
  // require a template the tutor cid doesn't have.
  const result = await page.evaluate(() => {
    const run = window.__app.run;
    run.tutorVocab = run.tutorVocab || {};
    run.tutorVocab.TUTOR_XYZ = { word: "xyz", translation: "xyz-en", note: "", pos: "noun" };
    run.released.push("TUTOR_XYZ");
    run.progress.TUTOR_XYZ = {
      level: 3, streak: 0, completed: false,
      lastShownAt: -999999, lastResult: null,
      provenance: "tutor", admittedFrom: null,
    };
    return window.canConceptBeTested("TUTOR_XYZ");
  });
  expect(result).toBe(false);
});

test("L2 tutor recognition MCQ renders after intro-card continue", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_MCQWORD", {
    word: "mcqword",
    translation: "correct-translation",
    note: "",
    pos: "noun",
  });

  // Advance past L1 intro (renderTutorIntro applies a correct answer on
  // continue), which lands the concept at L2 with the recognition MCQ.
  await page.click("#continue-btn");

  await expect(page.locator(".tutor-intro-badge")).toBeVisible();
  await expect(page.locator("#content h2")).toContainText("Mcqword");
  await expect(page.locator("#choices button")).toHaveCount(4);
  await expect(page.locator("#choices button", { hasText: "correct-translation" })).toBeVisible();
  await expect(page.locator("#check-btn")).toBeDisabled();

  const cid = await page.evaluate(() => window.__app.run.lastTargetConcept);
  expect(cid).toBe("TUTOR_MCQWORD");
});

test("two correct L2 answers mark the tutor concept completed", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_DONEWORD", {
    word: "doneword",
    translation: "done-translation",
    note: "",
    pos: "noun",
  });
  await page.click("#continue-btn");

  for (let i = 0; i < 2; i++) {
    await expect(page.locator("#choices button")).toHaveCount(4);
    await page.locator('#choices button', { hasText: "done-translation" }).click();
    await page.click("#check-btn");
    await page.click("#check-btn");
  }

  const state = await page.evaluate(() => {
    const p = window.__app.run.progress.TUTOR_DONEWORD;
    return { level: p.level, completed: p.completed };
  });
  expect(state.completed).toBe(true);
  expect(state.level).toBe(2);
});
