// Core journey: a brand-new learner goes from login all the way to their
// first exercise — language hub → reason screen → pack selection → roadmap →
// learning screen. This is the app's main funnel; if any screen wiring
// breaks, this fails.

import { test, expect, loginAs } from "./fixtures.mjs";

test("new learner reaches the first exercise", async ({ page }) => {
  await loginAs(page);

  // Start screen → language hub.
  await page.click("#open-app");
  await expect(page.locator("#language-screen.active")).toBeVisible();

  // Pick Portuguese (a non-beta target).
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();

  // First visit to a language → reason screen. Continue stays disabled
  // until a reason is chosen.
  await expect(page.locator("#reason-screen.active")).toBeVisible();
  await expect(page.locator("#reason-continue")).toBeDisabled();
  await page.locator("#reason-buttons button").first().click();
  await expect(page.locator("#reason-continue")).toBeEnabled();
  await page.click("#reason-continue");

  // Pack selection: the 2-pack cap holds, then start with one pack.
  await expect(page.locator("#pack-screen.active")).toBeVisible();
  const packs = page.locator("#pack-buttons button");
  expect(await packs.count()).toBeGreaterThanOrEqual(11);

  await packs.nth(0).click();
  await packs.nth(1).click();
  await packs.nth(2).click(); // over the cap — must be ignored
  await expect(page.locator("#pack-buttons button.selected")).toHaveCount(2);
  await packs.nth(1).click(); // deselect back down to one
  await expect(page.locator("#pack-buttons button.selected")).toHaveCount(1);

  await page.click("#start-run");

  // Roadmap (journey) screen with released stops.
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  expect(await page.locator("#roadmap-path li").count()).toBeGreaterThan(0);
  await page.click("#roadmap-continue");

  // Learning screen renders the first exercise: a Level 1 exposure card.
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await expect(page.locator("#session-subtitle")).toContainText("1");
  await expect(page.locator("#content h2")).toBeVisible();
  await expect(page.locator("#continue-btn")).toBeVisible();

  // Advancing works: after a continue the app either renders the next
  // exercise or — the first session is deliberately short — ends the session
  // on the roadmap. Both mean the loop is alive.
  await page.click("#continue-btn");
  await expect(
    page.locator("#learning-screen.active #content h2, #roadmap-screen.active #roadmap-path")
  ).toBeVisible();
});

test("returning learner skips setup and goes straight to exercises", async ({ page }) => {
  await loginAs(page);
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await page.locator("#reason-buttons button").first().click();
  await page.click("#reason-continue");
  await page.locator("#pack-buttons button").first().click();
  await page.click("#start-run");
  await page.click("#roadmap-continue");
  await expect(page.locator("#learning-screen.active")).toBeVisible();

  // Leave and re-enter the language: setup is complete, so the app must go
  // directly to the learning screen — no reason/pack screens again.
  await page.click("#quit-learning");
  await expect(page.locator("#start-screen.active")).toBeVisible();
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await expect(page.locator("#content h2")).toBeVisible();
});
