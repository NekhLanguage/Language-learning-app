// Tutor-admitted concepts render an L1 intro card seeded from
// run.tutorVocab (no template, no GLOBAL_VOCAB entry), then advance to L2
// where renderTutorRecognition takes over: a 4-option MCQ built from the
// tutor entry's translation + pack-sourced distractors. Two correct L2
// answers jump the concept to L5 (L3/L4 are skipped — no template to
// blank or option-build from), where it joins the matching round; L6 is a
// tile builder and L7 typed production, both seeded from the example
// sentence Anna banked with the word (typed-word fallback when none).

import { test, expect, startNewRun } from "./fixtures.mjs";

const exact = (s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

// Release enough bundles for pack distractors to exist, retire them so
// chooseConcept lands on the tutor cid we seed, then add the tutor entry
// at `level` (default L1). `peersAtL5` leaves that many released pack
// nouns live at L5 so a matching round has its quorum.
async function seedOneTutorConcept(page, cid, entry, { bundles = 6, level = 1, peersAtL5 = 0 } = {}) {
  await page.evaluate(({ cid, entry, bundles, level, peersAtL5 }) => {
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
    let peers = 0;
    for (const c of run.released) {
      if (peers >= peersAtL5) break;
      if (window.GLOBAL_VOCAB.concepts[c]?.type !== "noun") continue;
      run.progress[c].level = 5;
      run.progress[c].completed = false;
      peers++;
    }

    run.tutorVocab = run.tutorVocab || {};
    run.tutorVocab[cid] = entry;
    run.released.push(cid);
    run.progress[cid] = {
      level, streak: 0, completed: false,
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
  }, { cid, entry, bundles, level, peersAtL5 });
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

test("a tutor concept found at L3 (stale blob) is lifted to L5 when it renders", async ({ page }) => {
  await startNewRun(page);
  // No L5 peers: the lifted concept has no matching quorum, so the session
  // ends — the point is the level correction, not the exercise.
  await seedOneTutorConcept(page, "TUTOR_STALE", {
    word: "staleword", translation: "stale-en", note: "", pos: "noun",
  }, { level: 3 });

  await expect
    .poll(() => page.evaluate(() => window.__app.run.progress.TUTOR_STALE.level))
    .toBe(5);
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
  // L3 and L4 are skipped: L2 mastery lands the word at L5, not completed.
  expect(state.completed).toBe(false);
  expect(state.level).toBe(5);
});

test("L5: a tutor word joins the matching round with pack peers", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_MATCHWORD", {
    word: "matchword", translation: "matchword-en", note: "", pos: "noun",
  }, { level: 5, peersAtL5: 4 });

  await expect(page.locator("#matching-wrapper")).toBeVisible();
  await expect(page.locator("#left-column button[data-cid]")).toHaveCount(5);
  await expect(page.locator('#left-column button[data-cid="TUTOR_MATCHWORD"]')).toHaveText("matchword-en");
  await expect(page.locator('#right-column button[data-cid="TUTOR_MATCHWORD"]')).toHaveText("matchword");

  const cids = await page.locator("#left-column button[data-cid]").evaluateAll((els) => els.map((el) => el.dataset.cid));
  for (const cid of cids) {
    await page.locator(`#left-column button[data-cid="${cid}"]`).click();
    await page.locator(`#right-column button[data-cid="${cid}"]`).click();
  }
  await page.click("#check-matches");
  await expect(page.locator("#right-column button.matched")).toHaveCount(5);
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_MATCHWORD);
  expect(p.lastResult).toBe(true);
});

test("L6: tile builder from Anna's banked example sentence", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_TILEWORD", {
    word: "tileword", translation: "tileword-en", note: "", pos: "noun",
    exampleSentence: "Eu gosto de tileword.", exampleTranslation: "I like tileword.",
  }, { level: 6 });

  await expect(page.locator(".tutor-intro-badge")).toBeVisible();
  await expect(page.locator("#content strong").first()).toHaveText("I like tileword.");
  await expect(page.locator("#slot-container .sentence-slot")).toHaveCount(4);
  await expect(page.locator("#word-bank .word-bank-chip")).toHaveCount(4);

  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
  expect(correctWords).toEqual(["eu", "gosto", "de", "tileword"]);
  for (let i = 0; i < correctWords.length; i++) {
    await page.locator("#word-bank .word-bank-chip button").filter({ hasText: exact(correctWords[i]) }).first().click();
    await page.locator(`#slot-container [data-index="${i}"]`).click();
  }
  await page.click("#check-l6");
  await expect(page.locator("#slot-container .sentence-slot.correct")).toHaveCount(4);
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_TILEWORD);
  expect(p.lastResult).toBe(true);
  expect(p.level).toBe(6);
});

test("L6: a wrong build reveals Anna's sentence and stays at L6", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_WRONGTILE", {
    word: "wrongtile", translation: "wrongtile-en", note: "", pos: "noun",
    exampleSentence: "Eu vejo um wrongtile.", exampleTranslation: "I see a wrongtile.",
  }, { level: 6 });

  await expect(page.locator("#slot-container .sentence-slot")).toHaveCount(4);
  // Fill slots in reverse order — guaranteed wrong.
  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
  for (let i = 0; i < correctWords.length; i++) {
    const word = correctWords[correctWords.length - 1 - i];
    await page.locator("#word-bank .word-bank-chip button").filter({ hasText: exact(word) }).first().click();
    await page.locator(`#slot-container [data-index="${i}"]`).click();
  }
  await page.click("#check-l6");
  await expect(page.locator("#slot-container .sentence-slot.incorrect")).toHaveCount(4);
  await expect(page.locator(".correct-answer-reveal")).toContainText("Eu vejo um wrongtile.");
  await expect(page.locator("#check-l6")).toHaveText(/Continue/i);
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_WRONGTILE);
  expect(p.lastResult).toBe(false);
  expect(p.level).toBe(6);
});

test("L7: typed production of Anna's sentence, accent-loose", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_TYPEWORD", {
    word: "typeword", translation: "typeword-en", note: "", pos: "noun",
    exampleSentence: "Eu não tenho typeword.", exampleTranslation: "I don't have typeword.",
  }, { level: 7 });

  await expect(page.locator(".tutor-intro-badge")).toBeVisible();
  await expect(page.locator("#content strong").first()).toHaveText("I don't have typeword.");
  await expect(page.locator("#l7-input")).toBeVisible();
  await page.fill("#l7-input", "eu nao tenho typeword");
  await page.click("#check-l7");
  await expect(page.locator("#l7-input")).toBeDisabled();
  await expect(page.locator("#l7-feedback")).toContainText("Eu não tenho typeword.");
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_TYPEWORD);
  expect(p.lastResult).toBe(true);
  expect(p.streak).toBe(1);
});

test("L7: a wrong answer reveals the expected sentence", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_MISSWORD", {
    word: "missword", translation: "missword-en", note: "", pos: "noun",
    exampleSentence: "Eu como missword.", exampleTranslation: "I eat missword.",
  }, { level: 7 });

  await page.fill("#l7-input", "completely wrong answer");
  await page.click("#check-l7");
  await expect(page.locator("#l7-feedback")).toContainText("Eu como missword.");
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_MISSWORD);
  expect(p.lastResult).toBe(false);
  expect(p.level).toBe(7);
});

test("no banked sentence: L6 falls back to typing the word itself", async ({ page }) => {
  await startNewRun(page);
  await seedOneTutorConcept(page, "TUTOR_BAREWORD", {
    word: "bareword", translation: "bareword-en", note: "", pos: "noun",
    exampleSentence: "", exampleTranslation: "",
  }, { level: 6 });

  await expect(page.locator("#slot-container")).toHaveCount(0);
  await expect(page.locator("#content strong").first()).toHaveText("bareword-en");
  await expect(page.locator("#l7-input")).toBeVisible();
  await page.fill("#l7-input", "Bareword");
  await page.click("#check-l7");
  const p = await page.evaluate(() => window.__app.run.progress.TUTOR_BAREWORD);
  expect(p.lastResult).toBe(true);
});
