// A support language that has not translated a key yet falls back to
// English — never to the raw key name. v1.2.97 showed «trialKeepGoing» and
// «paywallBuy» to every non-English learner because the English lang file
// was only loaded on the sign-in screen, not on a signed-in boot.

import { test, expect, loginAs } from "./fixtures.mjs";

test("a non-English learner never sees a raw uiStrings key after a reload", async ({ page }) => {
  await loginAs(page);
  // Through the app's own picker, so the server copy carries it too.
  await page.click("#support-pill");
  await page.locator(".support-option", { hasText: "Deutsch" }).click();
  await expect(page.locator("#open-app")).not.toHaveText("OPEN APP");
  await page.reload();
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15_000 });
  await expect(page.locator("#open-app")).not.toHaveText("OPEN APP");

  const keys = await page.evaluate(async () => Object.keys((await (await fetch("lang/en.json")).json()).uiStrings));
  const isKey = (s) => keys.includes(String(s || "").trim());
  const texts = await page.locator("[data-i18n]").evaluateAll((els) => els.map((e) => e.textContent));
  const labels = await page.locator("[data-i18n-aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  for (const s of [...texts, ...labels]) expect(isKey(s), `raw key shown: ${s}`).toBe(false);
  await expect(page.locator("#trial-anna-continue")).toHaveText("Keep going");
});
