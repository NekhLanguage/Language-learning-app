// Session-complete coaching: finishing a session shows an encouraging line
// on the roadmap (from the coaching matrix when present, legacy template
// otherwise — either way it must render non-empty).

import { test, expect, startNewRun } from "./fixtures.mjs";

test("completing a session shows a coaching line on the roadmap", async ({ page }) => {
  await startNewRun(page);

  // End the lesson through the app's own end-of-session path (the same flag
  // the session budget sets), so the roadmap shows the finished-session line.
  // This used to click Continue until the first session ran out, which only
  // worked while lesson 1 was five intro cards; since 2026-09-30 lesson 1 has
  // ten words and reaches Level 2 quizzes, which Continue can't answer.
  await expect(page.locator("#learning-screen.active #continue-btn")).toBeVisible();
  await page.evaluate(() => {
    window.__app.run.sessionComplete = true;
    window.__app.rerender();
  });

  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  const message = page.locator("#roadmap-message");
  await expect(message).toBeVisible();
  expect((await message.innerText()).trim().length).toBeGreaterThan(5);
  // Placeholders must never leak.
  expect(await message.innerText()).not.toMatch(/\{(n|detail|lang)\}/);
});
