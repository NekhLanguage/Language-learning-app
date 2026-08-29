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

  // 17 registered languages minus the hidden one (fi, gate-pending) and
  // the support language (English).
  await expect(page.locator("#language-buttons button")).toHaveCount(15);
});

test("?showHidden=1 reveals gate-pending languages to QA (and only QA)", async ({ page }) => {
  // The QA hook Emi's run-7 needed: hidden languages are filtered at
  // module load, so without this a sweeper can never test them as the
  // interface language. A plain reload (no query) restores hiding.
  await page.goto("/?showHidden=1");
  await page.fill("#email-input", "showhidden-qa@example.com");
  await page.click("#login-btn");
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });

  await page.click("#open-app");
  await expect(page.locator("#language-screen.active")).toBeVisible();
  // 17 registered minus the support language — the hidden fi now shows.
  await expect(page.locator("#language-buttons button")).toHaveCount(16);
});
