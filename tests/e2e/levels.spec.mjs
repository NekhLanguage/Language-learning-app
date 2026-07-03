// One test per mastery-level renderer (L1 exposure … L7 free production),
// seeding the run state so the desired level renders, then answering
// correctly (and, for L2/L7, also incorrectly) and asserting the feedback
// and advance wiring.

import { test, expect, startNewRun, seedAllConceptsAt, lastTargetConcept } from "./fixtures.mjs";

function exact(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

test("L1 exposure card shows word, sentences, and advances", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 1);

  await expect(page.locator("#content h2")).toBeVisible();
  await expect(page.locator("#content hr")).toBeVisible();
  await expect(page.locator("#continue-btn")).toBeVisible();

  const firstWord = await page.locator("#content h2").innerText();
  await page.click("#continue-btn");
  await expect(page.locator("#content h2")).toBeVisible();

  const cid = await lastTargetConcept(page);
  expect(cid).toBeTruthy();
  expect(firstWord.trim()).not.toEqual("");
});

test("L2 multiple choice: correct answer marks green and advances", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  await expect(page.locator("#choices button[data-cid]")).toHaveCount(4);
  await expect(page.locator("#check-btn")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await expect(page.locator("#check-btn")).toBeEnabled();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate(
    (c) => window.__app.run.progress[c], cid
  );
  expect(progress.lastResult).toBe(true);

  // Check button becomes the advance button.
  await page.click("#check-btn");
  await expect(page.locator("#content h2, #content p").first()).toBeVisible();
});

test("L2 multiple choice: wrong answer marks red and does not level up", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  const cid = await lastTargetConcept(page);
  const wrong = page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first();
  await wrong.click();
  await page.click("#check-btn");

  await expect(wrong).toHaveClass(/incorrect/);
  // The correct option is revealed alongside.
  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);

  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(false);
  expect(progress.level).toBe(2);
});

test("L3 fill-in-the-blank renders tiles and accepts the right one", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 3);

  await expect(page.locator("#choices .word-bank-chip")).not.toHaveCount(0);
  await expect(page.locator("#check-btn")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L4 recognition renders target-language tiles and accepts the right one", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 4);

  await expect(page.locator("#choices .word-bank-chip")).not.toHaveCount(0);

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L5 matching: pairing every word with itself passes", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 5);

  await expect(page.locator("#matching-wrapper")).toBeVisible();
  const leftButtons = page.locator('#left-column button[data-cid]');
  await expect(leftButtons).toHaveCount(5);

  const cids = await leftButtons.evaluateAll((els) => els.map((el) => el.dataset.cid));
  for (const cid of cids) {
    await page.locator(`#left-column button[data-cid="${cid}"]`).click();
    await page.locator(`#right-column button[data-cid="${cid}"]`).click();
  }
  const counter = await page.evaluate(() => window.__app.run.exerciseCounter);
  await page.click("#check-matches");

  await expect(page.locator("#left-column button.matched")).toHaveCount(5);
  await expect(page.locator("#right-column button.matched")).toHaveCount(5);

  // L2 pattern: feedback stays on screen; the same button advances.
  await expect(page.locator("#check-matches")).toHaveText(/continue/i);
  await page.click("#check-matches");
  await expect
    .poll(() => page.evaluate(() => window.__app.run.exerciseCounter), { timeout: 5_000 })
    .toBeGreaterThan(counter);
});

test("L6 sentence builder: placing words in order passes", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 6, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#slot-container")).toBeVisible();
  await expect(page.locator("#word-bank")).toBeVisible();

  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
  expect(correctWords.length).toBeGreaterThan(1);

  for (let i = 0; i < correctWords.length; i++) {
    await page
      .locator("#word-bank .word-bank-chip button")
      .filter({ hasText: exact(correctWords[i]) })
      .first()
      .click();
    await page.locator(`#slot-container [data-index="${i}"]`).click();
  }
  const counter = await page.evaluate(() => window.__app.run.exerciseCounter);
  await page.click("#check-l6");

  await expect(page.locator("#slot-container .sentence-slot.correct")).toHaveCount(correctWords.length);
  // L2 pattern: feedback stays on screen; the same button advances.
  await expect(page.locator("#check-l6")).toHaveText(/continue/i);
  await page.click("#check-l6");
  await expect
    .poll(() => page.evaluate(() => window.__app.run.exerciseCounter), { timeout: 5_000 })
    .toBeGreaterThan(counter);
});

test("L7 free production: typing the exact sentence is accepted", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#l7-input")).toBeVisible();

  const { answer } = await page.evaluate(() => window.__app.lastExercise);
  expect(answer.trim()).not.toEqual("");

  await page.fill("#l7-input", answer);
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Correct");
  await expect(page.locator("#l7-input")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L7 free production: a wrong answer reveals the correct sentence", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  const { answer } = await page.evaluate(() => window.__app.lastExercise);

  await page.fill("#l7-input", "completely wrong answer");
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Incorrect");
  await expect(page.locator("#l7-feedback strong")).toContainText(answer);

  const cid = await lastTargetConcept(page);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(false);
});
