// -80 (Emi run-17): a run persisted before onboarding finished
// (setupComplete false, empty release plan) must resume onboarding on entry,
// never open an empty roadmap; and a stale render fired after the learner
// left the learning screen must never touch the run.

import { test, expect, loginAs, startNewRun } from "./fixtures.mjs";

function halfBuiltRun(reason) {
  return {
    selectedResourcePacks: [],
    setupComplete: false,
    releasePlan: [],
    releasePlanIndex: 0,
    releasedBundleIds: [],
    released: [],
    progress: {},
    templateProgress: {},
    exerciseCounter: 0,
    recentTemplates: [],
    sessionNumber: 1,
    sessionLevelUps: {},
    sessionAttempts: {},
    sessionExerciseCount: 0,
    sessionComplete: false,
    contentVersion: null, // filled from the live run below
    ...(reason ? { reason } : {}),
  };
}

// Plants a half-built Portuguese run on the live USER blob, copying the
// content version off a fresh run so the entry path does not reset it.
async function plantHalfBuiltRun(page, reason) {
  await page.evaluate(({ run }) => {
    const app = window.__app;
    const live = app.user;
    // Same content version the app stamps on new runs, read from a fresh
    // language's run shape (created on entry) — fall back to the first
    // existing run's stamp, else leave null and let the reset path prove
    // the guard still resumes onboarding.
    const stamps = Object.values(live.runs || {}).map((r) => r && r.contentVersion).filter(Boolean);
    run.contentVersion = stamps[0] || run.contentVersion;
    live.runs = live.runs || {};
    live.runs.pt = run;
  }, { run: halfBuiltRun(reason) });
}

test("half-built run with a saved reason resumes at the pack screen, then completes normally", async ({ page }) => {
  await loginAs(page);
  await page.click("#open-app");
  await plantHalfBuiltRun(page, { type: "travel", detail: "", savedAt: Date.now() });
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();

  await expect(page.locator("#pack-screen.active")).toBeVisible();
  await expect(page.locator("#roadmap-screen.active")).toHaveCount(0);

  await page.locator('#pack-buttons button[data-pack="everyday_life"]').click();
  await page.click("#start-run");
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  const state = await page.evaluate(() => {
    const r = window.__app.user.runs.pt;
    return { setupComplete: r.setupComplete, released: r.released.length, plan: r.releasePlan.length };
  });
  expect(state.setupComplete).toBe(true);
  expect(state.released).toBeGreaterThan(0);
  expect(state.plan).toBeGreaterThan(0);
});

test("half-built run without a reason resumes at the reason screen", async ({ page }) => {
  await loginAs(page);
  await page.click("#open-app");
  await plantHalfBuiltRun(page, null);
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();

  await expect(page.locator("#reason-screen.active")).toBeVisible();
  await expect(page.locator("#roadmap-screen.active")).toHaveCount(0);
});

test("a stale render after quitting never ends a session or touches the run", async ({ page }) => {
  await startNewRun(page);
  const before = await page.evaluate(() => {
    const r = window.__app.run;
    return { session: r.sessionNumber, counter: r.exerciseCounter };
  });
  await page.click("#quit-learning");
  await expect(page.locator("#start-screen.active")).toBeVisible();

  // Simulates the setTimeout(renderNext) a correct answer leaves behind.
  await page.evaluate(() => window.__app.rerender());

  await expect(page.locator("#start-screen.active")).toBeVisible();
  const after = await page.evaluate(() => {
    const r = window.__app.run;
    return { session: r.sessionNumber, counter: r.exerciseCounter };
  });
  expect(after).toEqual(before);
});

test("a malformed run (no released/progress) neither blanks the picker nor crashes START (Emi run-18 -89)", async ({ page }) => {
  await loginAs(page);
  await page.click("#open-app");
  await page.evaluate(() => {
    const user = window.__app.user;
    user.runs = user.runs || {};
    // Exactly the shape Emi planted: half-built, a reason, nothing else.
    user.runs.pt = { setupComplete: false, reason: { type: "travel", detail: "", savedAt: Date.now() } };
  });
  // Re-render the picker with the bad record in place: every card must survive.
  await page.fill("#language-search", "Port");
  await expect(page.locator("#language-buttons button", { hasText: "Portuguese" })).toBeVisible();
  await page.fill("#language-search", "");
  const cards = await page.locator("#language-buttons button").count();
  expect(cards).toBeGreaterThan(10);

  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await expect(page.locator("#pack-screen.active")).toBeVisible();
  await page.locator('#pack-buttons button[data-pack="everyday_life"]').click();
  await page.click("#start-run");
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await page.click("#roadmap-continue");
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await expect(page.locator("#content h2")).toBeVisible();
});
