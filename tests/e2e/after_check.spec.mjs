// One rule after Check on every exercise level (Nekh 2026-10-10): a clean
// correct answer moves on by itself after about a second; a miss (or a
// correct answer that comes with a correction) waits for Continue.

import { test, expect, startNewRun, seedAllConceptsAt, lastTargetConcept } from "./fixtures.mjs";

const counter = (page) => page.evaluate(() => window.__app.run.exerciseCounter);

for (const level of [2, 3, 4]) {
  test(`L${level}: a correct answer moves on by itself after about a second`, async ({ page }) => {
    await startNewRun(page);
    await seedAllConceptsAt(page, level);

    const cid = await lastTargetConcept(page);
    await page.locator(`#choices button[data-cid="${cid}"]`).click();
    const before = await counter(page);
    const checkedAt = Date.now();
    await page.click("#check-btn");

    await expect(page.locator("#check-btn")).toHaveText(/Continue/i);
    await expect.poll(() => counter(page), { timeout: 5_000 }).toBeGreaterThan(before);
    // Long enough to see the green, short enough to keep the pace.
    expect(Date.now() - checkedAt).toBeGreaterThanOrEqual(900);
  });

  test(`L${level}: a wrong answer waits for Continue`, async ({ page }) => {
    await startNewRun(page);
    await seedAllConceptsAt(page, level);

    const cid = await lastTargetConcept(page);
    await page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first().click();
    const before = await counter(page);
    await page.click("#check-btn");

    await expect(page.locator("#check-btn")).toHaveText(/Continue/i);
    await page.waitForTimeout(1_800);
    expect(await counter(page)).toBe(before);

    await page.click("#check-btn");
    await expect.poll(() => counter(page)).toBeGreaterThan(before);
  });
}

test("a correct answer can be skipped ahead with Continue, and advances only once", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  const before = await counter(page);
  await page.click("#check-btn");
  await page.click("#check-btn");
  await expect.poll(() => counter(page)).toBe(before + 1);

  // The auto-advance timer from the first exercise must not skip the next one.
  await page.waitForTimeout(1_500);
  expect(await counter(page)).toBe(before + 1);
});

test("L7: a clean answer moves on by itself; a wrong one waits", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  const { answer } = await page.evaluate(() => window.__app.lastExercise);
  let before = await counter(page);
  await page.fill("#l7-input", answer);
  await page.click("#check-l7");
  await expect(page.locator("#l7-feedback")).toContainText("Correct");
  await expect.poll(() => counter(page), { timeout: 5_000 }).toBeGreaterThan(before);

  await expect(page.locator("#l7-input")).toBeEnabled();
  before = await counter(page);
  await page.fill("#l7-input", "completely wrong answer");
  await page.click("#check-l7");
  await expect(page.locator("#l7-feedback")).toContainText("Incorrect");
  await page.waitForTimeout(1_800);
  expect(await counter(page)).toBe(before);
});

test("L7: an answer right except for accents shows the proper form and waits", async ({ page }) => {
  await startNewRun(page); // Portuguese: most sentences carry an accent
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  const { answer } = await page.evaluate(() => window.__app.lastExercise);
  const stripped = answer.normalize("NFD").replace(/[̀-ͯ]/g, "");
  test.skip(stripped === answer, "this sentence has no accents to drop");

  const before = await counter(page);
  await page.fill("#l7-input", stripped);
  await page.click("#check-l7");
  await expect(page.locator("#l7-feedback strong")).toContainText(answer);
  await page.waitForTimeout(1_800);
  expect(await counter(page)).toBe(before);
});
