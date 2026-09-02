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

test("a corrupted user blob is restored from the boot-time backup", async ({ page }) => {
  await startNewRun(page);

  // A reload writes the boot-time backup of the (healthy) state.
  await page.reload();
  await expect(page.locator("#start-screen.active")).toBeVisible();
  const healthyId = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).id);

  // Corrupt the primary blob, as a bad deploy or interrupted write might.
  await page.evaluate(() => localStorage.setItem("zth_user", "{corrupt###"));
  await page.reload();

  // The app must boot normally and recover the same account.
  await expect(page.locator("#start-screen.active")).toBeVisible();
  const recoveredId = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).id);
  expect(recoveredId).toBe(healthyId);
});

test("corrupted state with no backup still boots instead of crashing", async ({ page, pageErrors }) => {
  await startNewRun(page);

  await page.evaluate(() => {
    localStorage.setItem("zth_user", "{corrupt###");
    localStorage.removeItem("zth_user_backup");
  });
  await page.reload();

  // No white screen: the app starts over with a fresh user (the server copy
  // is re-synced at boot since the email is still stored).
  await expect(page.locator("#start-screen.active")).toBeVisible();
  await expect(page.locator("#open-app")).toBeVisible();
  expect(pageErrors).toEqual([]);
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

test("a stale server copy does not overwrite newer local progress on reload (Emi 2026-09-02-55)", async ({ page }) => {
  const email = await startNewRun(page);

  // What the app synced: setup complete, a released set.
  const synced = (await (await page.request.get("/__devserver/users")).json())[email];
  expect(synced.runs.pt.released.length).toBeGreaterThan(0);
  const localBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")));

  // Plant an OLDER server copy — the state a save that 504'd would leave
  // behind: an earlier lastLocalChange and no released progress.
  const stale = JSON.parse(JSON.stringify(synced));
  stale.lastLocalChange = (synced.lastLocalChange || Date.now()) - 60_000;
  stale.runs.pt.released = [];
  stale.runs.pt.setupComplete = false;
  await page.request.post("/.netlify/functions/saveUser", { data: { email, user: stale } });

  await page.reload();
  await expect(page.locator("#start-screen.active")).toBeVisible();

  // The boot sync must keep the newer local copy…
  await expect.poll(async () => page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    return u.runs.pt?.released?.length || 0;
  })).toBeGreaterThan(0);
  const localAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")));
  expect(localAfter.runs.pt.setupComplete).toBe(true);
  expect(localAfter.runs.pt.released).toEqual(localBefore.runs.pt.released);

  // …and push it back up so the server catches up instead of staying stale.
  await expect.poll(async () => {
    const users = await (await page.request.get("/__devserver/users")).json();
    return users[email]?.runs?.pt?.released?.length || 0;
  }).toBeGreaterThan(0);
});

test("a {user: null} answer from the server does not wipe local progress (Emi 2026-09-02-61)", async ({ page }) => {
  const email = await startNewRun(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")));
  expect(before.runs.pt.released.length).toBeGreaterThan(0);

  // Make the server answer 200 {user: null} — a read miss the client
  // cannot tell from "no account".
  await page.route("**/.netlify/functions/loadUser", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null }) }));
  await page.reload();
  await expect(page.locator("#start-screen.active")).toBeVisible();

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")));
  expect(after.id).toBe(before.id);
  expect(after.runs.pt.released).toEqual(before.runs.pt.released);
  await page.unroute("**/.netlify/functions/loadUser");
});
