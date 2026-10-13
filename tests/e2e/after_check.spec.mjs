// One rule after Check on every exercise level (Nekh 2026-10-10, timing
// 2026-10-13): a clean correct answer moves on by itself after 1.25 s with
// no button; a miss (or a correct answer that comes with a correction)
// waits for Continue.

import { test, expect, startNewRun, seedAllConceptsAt, lastTargetConcept, loginAs } from "./fixtures.mjs";

const counter = (page) => page.evaluate(() => window.__app.run.exerciseCounter);

for (const level of [2, 3, 4]) {
  test(`L${level}: a correct answer moves on by itself after 1.25 s, with no button`, async ({ page }) => {
    await startNewRun(page);
    await seedAllConceptsAt(page, level);

    const cid = await lastTargetConcept(page);
    await page.locator(`#choices button[data-cid="${cid}"]`).click();
    const before = await counter(page);
    const checkedAt = Date.now();
    await page.click("#check-btn");

    await expect(page.locator("#check-btn")).toBeHidden();
    await expect.poll(() => counter(page), { timeout: 5_000 }).toBeGreaterThan(before);
    // Long enough to read the card, short enough to keep the pace.
    expect(Date.now() - checkedAt).toBeGreaterThanOrEqual(1_150);
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

test("a correct answer advances exactly once, and its timer never skips the next exercise", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  const before = await counter(page);
  await page.click("#check-btn");
  await expect.poll(() => counter(page), { timeout: 5_000 }).toBe(before + 1);

  // Nothing more fires from the first exercise's timer.
  await page.waitForTimeout(1_600);
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
  await expect(page.locator("#l7-feedback strong.l7-answer")).toContainText(answer);
  await page.waitForTimeout(1_800);
  expect(await counter(page)).toBe(before);
});

test("L3: a miss explains the option the learner picked, not the one already shown in green", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 3);
  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first().click();
  await page.click("#check-btn");
  await expect(page.locator("#feedback-sheet .sheet-verdict")).toContainText("Incorrect");
  await expect(page.locator("#feedback-sheet .sheet-answer")).toContainText("You picked «");
  await expect(page.locator("#feedback-sheet .sheet-answer")).toContainText("which means");
});

test("L2: a miss gives the picked word in the language being learned", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);
  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first().click();
  await page.click("#check-btn");
  await expect(page.locator("#feedback-sheet .sheet-answer")).toContainText("In Portuguese that's «");
});

test("a correct answer slides up Anna's card with no button; she lands on well-done", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);
  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await page.click("#check-btn");
  await expect(page.locator("#feedback-sheet.is-correct .feedback-sheet-name")).toHaveText("Anna");
  await expect(page.locator("#feedback-sheet button")).toHaveCount(0);
  // Transition frame first (sheet 2), then the pose it lands on.
  await expect(page.locator("#feedback-sheet .feedback-anna")).toHaveAttribute("src", /well-done/);
});

test("a wrong answer: Anna moves through her transition frames into correcting; Continue in the card", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 3);
  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first().click();
  await page.click("#check-btn");
  await expect(page.locator("#feedback-sheet.is-wrong #check-btn")).toBeVisible();
  await expect(page.locator("#feedback-sheet .feedback-anna")).toHaveAttribute("src", /\/correcting\.webp/);
});

test("the setup journey (no back target) still has a way back to the menu", async ({ page }) => {
  // Nekh 2026-10-13: the journey shown at setup and after a session had no
  // way out but Continue.
  await loginAs(page, `journey-${Math.random().toString(36).slice(2)}@example.com`);
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await page.locator("#reason-buttons button").first().click();
  await page.click("#reason-continue");
  await page.locator('#pack-buttons button[data-pack="everyday_life"]').click();
  await page.click("#start-run");
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await expect(page.locator("#roadmap-back")).toBeVisible();
  await page.click("#roadmap-back");
  await expect(page.locator("#start-screen.active")).toBeVisible();
});
