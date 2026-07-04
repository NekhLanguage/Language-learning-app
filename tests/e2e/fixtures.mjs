// Shared e2e fixtures.
//
// Every test gets a `pageErrors` array that collects console errors, uncaught
// page errors, failed requests, and 4xx/5xx responses. The fixture asserts the
// array is empty at teardown, so any test that breaks the app's console fails
// even if its own assertions pass. Tests that intentionally provoke errors can
// splice entries out of the array before finishing.

import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("requestfailed", (req) => {
        const reason = req.failure()?.errorText || "";
        // Navigation (reload/login) cancels in-flight fetches — not an error.
        if (reason === "net::ERR_ABORTED") return;
        errors.push(`requestfailed: ${req.method()} ${req.url()} — ${reason}`);
      });
      page.on("response", (res) => {
        if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
      });
      await use(errors);
      expect(errors, "the app must stay free of console/page/network errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// Completes the email access gate and waits for the app to boot.
// The dev-server stub allows any email that doesn't contain "noaccess".
export async function loginAs(page, email = "test@example.com") {
  await page.goto("/");
  await page.fill("#email-input", email);
  await page.click("#login-btn");
  // checkAccess → loadUser → location.reload() → start screen.
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });
}

// Drives a fresh account through setup (language → reason → pack → roadmap)
// and lands on the learning screen with the first exercise rendered.
export async function startNewRun(page, { language = "Portuguese", packId = "everyday_life", email } = {}) {
  // Unique email per run: the dev server's in-memory store is shared across
  // parallel tests, and a reused address would resume that account's state
  // instead of exercising the fresh-setup path.
  email ||= `learner-${Math.random().toString(36).slice(2)}@example.com`;
  await loginAs(page, email);
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: language }).click();
  await expect(page.locator("#reason-screen.active")).toBeVisible();
  await page.locator("#reason-buttons button").first().click();
  await page.click("#reason-continue");
  await page.locator(`#pack-buttons button[data-pack="${packId}"]`).click();
  await page.click("#start-run");
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await page.click("#roadmap-continue");
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await expect(page.locator("#content h2")).toBeVisible();
  return email;
}

// Seeds the live run so every released concept sits at `level`, releasing the
// first `bundles` entries of the release plan for realistic distractor pools,
// then re-renders. For L6/L7 pass restrictTypes to keep modifier/recognition
// concepts (whose level caps are lower) out of the exercise pool.
export async function seedAllConceptsAt(page, level, { bundles = 4, restrictTypes = null, adjectivesAt = null } = {}) {
  await page.evaluate(({ level, bundles, restrictTypes, adjectivesAt }) => {
    const app = window.__app;
    const run = app.run;
    const index = app.bundleIndex;

    const bundleIds = run.releasePlan.slice(0, bundles);
    run.releasedBundleIds = bundleIds;
    run.releasePlanIndex = bundleIds.length;
    run.released = [...new Set(bundleIds.flatMap((id) => index[id]?.concepts || []))];

    run.progress = {};
    for (const cid of run.released) {
      const type = window.GLOBAL_VOCAB.concepts[cid]?.type;
      const eligible = !restrictTypes || restrictTypes.includes(type);
      // adjectivesAt: keep adjectives active at the given level (instead of
      // completed) so random modifier injection has an eligible pool —
      // used to regression-test injection suppression.
      const adjActive = adjectivesAt != null && type === "adjective";
      run.progress[cid] = {
        level: adjActive ? adjectivesAt : eligible ? level : 1,
        streak: 0,
        cooldown: 0,
        completed: adjActive ? false : !eligible,
        lastShownAt: -999999,
        lastResult: null,
      };
    }

    run.templateProgress = {};
    run.exerciseCounter = 0;
    run.recentTemplates = [];
    run.sessionLevelUps = {};
    run.sessionAttempts = {};
    run.sessionExerciseCount = 0;
    run.sessionComplete = false;

    app.rerender();
  }, { level, bundles, restrictTypes, adjectivesAt });
}

// The concept the current exercise is asking about.
export function lastTargetConcept(page) {
  return page.evaluate(() => window.__app.run.lastTargetConcept);
}
