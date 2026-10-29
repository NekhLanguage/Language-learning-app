// Waiting that reads as broken (Nekh 2026-10-29: "any time there is extra
// loading people start thinking something is wrong"). On a phone the start
// screen paints ~1 s before app.js has loaded and wired it, and Anna's page
// used to sit blank for ~5 s while it fetched every vocabulary file.

import { test, expect, loginAs, startNewRun } from "./fixtures.mjs";

// Holds app.js (and its modulepreload) until release() is called.
async function holdAppJs(page) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route(/\/app\.js\?v=/, async (route) => { await gate; await route.continue(); });
  return () => release();
}

test("a tap on OPEN APP before app.js has loaded is shown and then carried out", async ({ page }) => {
  await loginAs(page);
  const release = await holdAppJs(page);
  await page.reload({ waitUntil: "commit" });
  await expect(page.locator("#open-app")).toBeVisible();
  await page.click("#open-app");
  await expect(page.locator("#open-app")).toHaveClass(/is-waking/);
  await expect(page.locator("#start-screen.active")).toBeVisible();

  release();
  await expect(page.locator("#language-screen.active")).toBeVisible();
  await expect(page.locator("#open-app")).not.toHaveClass(/is-waking/);
});

test("Anna unlocks from this device's last check before app.js has loaded", async ({ page }) => {
  await startNewRun(page);
  await page.goto("/");
  await expect(page.locator("#link-tutor")).toHaveAttribute("href", "tutor.html");

  const release = await holdAppJs(page);
  await page.reload({ waitUntil: "commit" });
  await expect(page.locator("#open-app")).toBeVisible();
  const anna = page.locator("#link-tutor");
  await expect(anna).toHaveAttribute("href", "tutor.html");
  await expect(anna).not.toHaveClass(/locked/);
  release();
  await page.waitForFunction(() => !!window.__app);
  await expect(anna).toHaveAttribute("href", "tutor.html");
});

test("Anna says she is getting ready, starts on the run's own packs, and loads the rest at End session", async ({ page }) => {
  await startNewRun(page, { packId: "everyday_life" });
  const requested = new Set();
  page.on("request", (r) => requested.add(new URL(r.url()).pathname));

  let releaseUser;
  const userGate = new Promise((r) => { releaseUser = r; });
  await page.route("**/.netlify/functions/loadUser", async (route) => { await userGate; await route.continue(); });
  await page.goto("/tutor.html");
  await expect(page.locator(".tutor-loading")).toBeVisible();
  releaseUser();
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator(".tutor-loading")).toHaveCount(0);

  expect(requested.has("/everyday_life.json")).toBe(true);
  expect(requested.has("/nouns.json")).toBe(true);
  expect(requested.has("/pokemon.json")).toBe(false);

  await page.click("#tutor-settings-save");
  await page.fill("#tutor-input", "olá");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Your tutor will remember this next time" })).toBeVisible({ timeout: 10_000 });
  // The admission step's collision check reads every pack.
  expect(requested.has("/pokemon.json")).toBe(true);
});
