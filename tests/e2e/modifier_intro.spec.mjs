// Emi run-31 (2026-10-04): -196 — modifiers (numbers, adjectives) reach
// sentences by injection and appear in no template's concept list, so the
// level-1 "can render" gate of v1.2.84 dropped every one of them at pick
// time: ONE–TWENTY, SMALL, BIG, OUR, THEIR, the colours and DELICIOUS were
// released and never introduced in any language. The second test covers
// -192/-141: a pack's own words render in its sentences even when another
// pack defines the same concept id with a different word.

import { test, expect, startNewRun, seedAllConceptsAt, lastTargetConcept } from "./fixtures.mjs";

const NUMBERS = new Set(["ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE","TEN",
  "ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN","SEVENTEEN","EIGHTEEN","NINETEEN","TWENTY"]);

test("a released number gets its level-1 intro card instead of ending the session (Emi -196)", async ({ page }) => {
  await startNewRun(page);
  // Every released word completed except the numbers, which sit at level 1.
  await seedAllConceptsAt(page, 1, { bundles: 24, restrictTypes: ["number"] });

  await expect(page.locator("#content h2")).toBeVisible();
  const cid = await lastTargetConcept(page);
  expect(NUMBERS.has(cid), `expected a number, got ${cid}`).toBe(true);
  const complete = await page.evaluate(() => window.__app.run.sessionComplete);
  expect(complete).toBe(false);
});

test("a pack's own verb renders in its sentences when another pack reuses the concept id (Emi -192/-141)", async ({ page }) => {
  await startNewRun(page, { language: "Ukrainian", packId: "tourism" });
  // Only NAVIGATE is left to introduce; its tourism templates need HE / I / ROUTE.
  await page.evaluate(() => {
    const run = window.__app.run;
    run.released = ["HE", "FIRST_PERSON_SINGULAR", "NAVIGATE", "ROUTE"];
    run.progress = {};
    for (const cid of run.released) {
      run.progress[cid] = {
        level: cid === "NAVIGATE" ? 1 : 7, streak: 0,
        completed: cid !== "NAVIGATE", lastShownAt: -999999, lastResult: null,
      };
    }
    run.templateProgress = {}; run.exerciseCounter = 0; run.recentTemplates = [];
    run.sessionLevelUps = {}; run.sessionAttempts = {}; run.sessionExerciseCount = 0;
    run.sessionComplete = false;
    window.__app.rerender();
  });

  await expect(page.locator("#content h2")).toBeVisible();
  expect(await lastTargetConcept(page)).toBe("NAVIGATE");
  const text = await page.locator("#content").innerText();
  // Tourism's «прокладати» / bare «орієнтуватися», never the space pack's «пілотувати».
  expect(text).toMatch(/прокладати|орієнт/i);
  expect(text).not.toMatch(/пілот/i);
});
