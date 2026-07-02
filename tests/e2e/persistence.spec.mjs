// Persistence: progress must survive reloads (localStorage), sync to the
// backend (saveUser), and restore onto a fresh device (loadUser). The dev
// server keeps saved users in memory and exposes them at /__devserver/users.

import { test, expect, startNewRun } from "./fixtures.mjs";

test("run state survives a page reload", async ({ page }) => {
  await startNewRun(page);

  const before = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem("zth_user"));
    return { id: user.id, run: user.runs.pt };
  });
  expect(before.run.setupComplete).toBe(true);
  expect(before.run.released.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator("#start-screen.active")).toBeVisible();
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();

  // Setup already complete → straight to exercises, with the same run state.
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  const after = await page.evaluate(() => ({
    id: JSON.parse(localStorage.getItem("zth_user")).id,
    released: window.__app.run.released,
    setupComplete: window.__app.run.setupComplete,
    packs: window.__app.run.selectedResourcePacks,
  }));

  expect(after.id).toBe(before.id);
  expect(after.setupComplete).toBe(true);
  expect(after.released).toEqual(before.run.released);
  expect(after.packs).toEqual(before.run.selectedResourcePacks);
});

test("run state is synced to the backend on save", async ({ page }) => {
  const email = await startNewRun(page);

  const res = await page.request.get("/__devserver/users");
  const users = await res.json();
  const synced = users[email];

  expect(synced).toBeTruthy();
  expect(synced.runs.pt.setupComplete).toBe(true);
  expect(synced.runs.pt.selectedResourcePacks).toEqual(["everyday_life"]);

  const localId = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).id);
  expect(synced.id).toBe(localId);
});

test("a fresh device restores the account from the server", async ({ page }) => {
  const email = await startNewRun(page);
  const released = await page.evaluate(() => window.__app.run.released);

  // Simulate a new device: wipe local state entirely.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#email-input")).toBeVisible();

  // Logging in again must pull the account back from the server.
  await page.fill("#email-input", email);
  await page.click("#login-btn");
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });

  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();

  // No reason/pack screens — the restored run is already set up.
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  expect(await page.evaluate(() => window.__app.run.released)).toEqual(released);
});
