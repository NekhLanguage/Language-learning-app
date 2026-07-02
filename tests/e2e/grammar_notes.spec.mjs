// Grammar "why?" chips: exposure cards whose sentence used a noteworthy
// grammar rule offer a tappable chip that opens a plain-language explanation
// in the learner's support language.

import { test, expect, startNewRun } from "./fixtures.mjs";

test("exposure card offers a grammar chip that opens an explanation", async ({ page }) => {
  await startNewRun(page); // Portuguese target, English support

  // Find an exposure whose sentence fired at least one traced rule. Early
  // exposures are verb templates ("Eu como comida"), so the first card
  // almost always qualifies; allow a few continues just in case.
  let rules = [];
  for (let i = 0; i < 4; i++) {
    rules = await page.evaluate(() => window.__app.lastExercise?.rules || []);
    if (rules.length > 0) break;
    await page.click("#continue-btn");
  }
  expect(rules.length).toBeGreaterThan(0);

  const chip = page.locator(".grammar-chip").first();
  await expect(chip).toBeVisible();

  // Open: the explanation panel appears, localized and fully rendered.
  await chip.click();
  const panel = page.locator(".grammar-note-panel:not(.hidden)");
  await expect(panel).toBeVisible();
  const text = await panel.innerText();
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toContain("{lang}"); // placeholder resolved

  // Toggle closed.
  await chip.click();
  await expect(page.locator(".grammar-note-panel:not(.hidden)")).toHaveCount(0);

  // The chip must not interfere with advancing.
  await page.click("#continue-btn");
  await expect(page.locator("#content h2")).toBeVisible();
});

test("exposure support sentences use the authored translation", async ({ page }) => {
  await startNewRun(page);

  // Fresh runs have no L4+ modifiers to inject, so every exposure sentence
  // is plain — the support line must come from the authored render, not the
  // word-for-word engine generation.
  for (let i = 0; i < 3; i++) {
    const source = await page.evaluate(() => window.__app.lastExercise?.supportSource);
    expect(source).toBe("authored");
    await page.click("#continue-btn");
    const stillExposing = await page.locator("#continue-btn").isVisible().catch(() => false);
    if (!stillExposing) break;
  }
});
