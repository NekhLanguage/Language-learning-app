// Session-complete coaching: finishing a session shows an encouraging line
// on the roadmap (from the coaching matrix when present, legacy template
// otherwise — either way it must render non-empty).

import { test, expect, startNewRun } from "./fixtures.mjs";

test("completing a session shows a coaching line on the roadmap", async ({ page }) => {
  await startNewRun(page);

  // The short first session ends after a handful of exposures.
  for (let i = 0; i < 12; i++) {
    const onRoadmap = await page.locator("#roadmap-screen.active").isVisible();
    if (onRoadmap) break;
    await page.click("#continue-btn");
  }

  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  const message = page.locator("#roadmap-message");
  await expect(message).toBeVisible();
  expect((await message.innerText()).trim().length).toBeGreaterThan(5);
  // Placeholders must never leak.
  expect(await message.innerText()).not.toMatch(/\{(n|detail|lang)\}/);
});
