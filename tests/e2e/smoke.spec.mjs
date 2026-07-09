// Boot smoke tests: the app loads, gates access, logs in, and reaches the
// language hub — all with zero console/page/network errors (enforced by the
// pageErrors fixture in fixtures.mjs).

import { test, expect, loginAs } from "./fixtures.mjs";

test("logged-out visit shows the access gate", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#email-input")).toBeVisible();
  await expect(page.locator("#login-btn")).toBeVisible();
  await expect(page.locator("#link-buy-access")).toBeVisible();
});

test("unknown email is rejected with a notice", async ({ page }) => {
  await page.goto("/");

  const dialogMessage = new Promise((resolve) => page.once("dialog", (d) => {
    const msg = d.message();
    d.dismiss().catch(() => {});
    resolve(msg);
  }));

  await page.fill("#email-input", "noaccess@example.com");
  await page.click("#login-btn");

  expect(await dialogMessage).toContain("No access");
  // Still gated.
  await expect(page.locator("#email-input")).toBeVisible();
});

test("login lands on the start screen", async ({ page }) => {
  await loginAs(page);

  await expect(page.locator("#open-app")).toBeVisible();
  // Localized strings applied (not empty defaults).
  await expect(page.locator("#open-app")).not.toHaveText("");
  // Support-language pill painted from state.
  await expect(page.locator("#support-short")).toHaveText("EN");
});

test("start screen leads to the language hub", async ({ page }) => {
  await loginAs(page);

  await page.click("#open-app");
  await expect(page.locator("#language-screen.active")).toBeVisible();

  // 14 registered languages minus the support language (English).
  await expect(page.locator("#language-buttons button")).toHaveCount(13);
});
