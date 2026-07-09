// Session-complete coaching: finishing a session shows an encouraging line
// on the roadmap (from the coaching matrix when present, legacy template
// otherwise — either way it must render non-empty).

import { test, expect, startNewRun } from "./fixtures.mjs";

test("completing a session shows a coaching line on the roadmap", async ({ page }) => {
  await startNewRun(page);

  // The short first session ends after a handful of exposures. The
  // roadmap transition happens on a setTimeout(0) after the last continue,
  // so each iteration must WAIT for either the next exposure or the roadmap
  // rather than checking-then-clicking (that race flaked in CI). The click
  // itself is bounded and non-fatal for the same reason: the roadmap can
  // appear between the visibility check and the click, hiding the button
  // for good — the loop then re-evaluates and takes the roadmap branch.
  for (let i = 0; i < 12; i++) {
    await page
      .locator("#roadmap-screen.active #roadmap-message, #learning-screen.active #continue-btn")
      .first()
      .waitFor({ state: "visible" });
    if (await page.locator("#roadmap-screen.active").isVisible()) break;
    try {
      await page.locator("#learning-screen.active #continue-btn").click({ timeout: 5_000 });
    } catch {
      // Button vanished mid-click (session ended) — loop and re-check.
    }
  }

  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  const message = page.locator("#roadmap-message");
  await expect(message).toBeVisible();
  expect((await message.innerText()).trim().length).toBeGreaterThan(5);
  // Placeholders must never leak.
  expect(await message.innerText()).not.toMatch(/\{(n|detail|lang)\}/);
});
