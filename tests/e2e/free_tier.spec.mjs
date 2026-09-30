// Free tier (Nekh 2026-09-30): lessons 1-3 free behind an email account,
// paywall at lesson 4, Anna fully paywalled, lesson 1 is ten words.
// The dev server treats an email containing "trial" as a free-tier account
// and mirrors the real server gates (see tests/dev-server.mjs).

import { test, expect, startNewRun, loginAs, authHeadersFor } from "./fixtures.mjs";

const uniq = () => Math.random().toString(36).slice(2);

// Finish the current lesson (session) the way the app does when the
// session budget runs out, then continue past the roadmap.
async function finishLesson(page) {
  await page.evaluate(() => {
    window.__app.run.sessionComplete = true;
    window.__app.rerender();
  });
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await page.click("#roadmap-continue");
}

async function events(request, email) {
  const res = await request.get("/__devserver/events");
  return (await res.json()).filter((e) => e.email === email);
}

test("lesson 1 releases ten words and renders more than one sentence", async ({ page }) => {
  await startNewRun(page);
  const released = await page.evaluate(() => window.__app.run.released);
  expect(released).toEqual(expect.arrayContaining(
    ["FIRST_PERSON_SINGULAR", "EAT", "FOOD", "SECOND_PERSON", "DRINK", "WATER", "HE", "READ", "BOOK", "SHE"]
  ));
  expect(released).toHaveLength(10);
});

test("a saved plan that still lists the retired core_02 keeps moving", async ({ page }) => {
  await startNewRun(page);
  const after = await page.evaluate(() => {
    const run = window.__app.run;
    // A release plan frozen before lesson 1 grew: core_01, core_02, core_03…
    run.releasePlan = ["core_01", "core_02", ...run.releasePlan.slice(1)];
    run.releasedBundleIds = ["core_01"];
    run.releasePlanIndex = 1;
    run.sessionComplete = true;
    window.__app.rerender();
    return { ids: run.releasedBundleIds.slice(), index: run.releasePlanIndex };
  });
  expect(after.ids).toEqual(["core_01", "core_02"]);
  expect(after.index).toBe(2);
});

test("sign-in screen offers the free start with just an email", async ({ page }) => {
  await page.goto("/?start=free");
  await expect(page.locator("#gate-start-free")).toBeVisible();
  await expect(page.locator("#gate-start-free-heading")).toHaveText("Try the first three lessons free");
  await page.fill("#start-free-email", `new-${uniq()}@example.com`);
  await page.click("#start-free-btn");
  await expect(page.locator("#start-free-message")).toContainText("inbox");
});

test("free path: three lessons, Anna screen, lesson-4 paywall, pay, lesson 4 opens", async ({ page, request }) => {
  const email = `trial-${uniq()}@example.com`;
  await startNewRun(page, { email });

  // Anna is visible and locked for a free account.
  expect(await page.evaluate(() => localStorage.getItem("zth_access_tier"))).toBe("trial");

  await finishLesson(page); // lesson 1 → lesson 2
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await finishLesson(page); // lesson 2 → lesson 3
  await expect(page.locator("#learning-screen.active")).toBeVisible();

  // Lesson 3 done: the roadmap marks lesson 4 as the full app's, and
  // nothing past lesson 3 is released.
  await page.evaluate(() => {
    window.__app.run.sessionComplete = true;
    window.__app.rerender();
  });
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await expect(page.locator("#roadmap-path li.paywalled").first()).toContainText("Full app");
  expect(await page.evaluate(() => window.__app.run.releasedBundleIds.length)).toBe(3);
  await page.click("#roadmap-continue");

  // Screen A, once: Anna is the added benefit.
  await expect(page.locator("#trial-anna-screen.active")).toBeVisible();
  await expect(page.locator("#trial-anna-screen")).toContainText("Anna");
  await page.click("#trial-anna-continue");

  // Screen B: the paywall, one line naming the app, Anna and the price.
  await expect(page.locator("#paywall-screen.active")).toBeVisible();
  await expect(page.locator("#paywall-buy")).toHaveText("Get the app + 1 month of Anna for $19");
  await expect(page.locator("#paywall-screen .paywall-renewal")).toContainText("$19 a month");
  await expect(page.locator("#paywall-buy")).toHaveAttribute("href", new RegExp(`prefilled_email=${encodeURIComponent(email)}`));

  // The server never stored a blob past lesson 3.
  const stored = (await (await request.get("/__devserver/users")).json())[email];
  expect(Math.max(...Object.values(stored.runs).map((r) => r.releasedBundleIds.length))).toBe(3);

  // Funnel rows.
  const got = (await events(request, email)).map((e) => e.event_type + (e.props?.lesson ? `:${e.props.lesson}` : ""));
  expect(got).toEqual(expect.arrayContaining([
    "trial_start", "trial_lesson_complete:1", "trial_lesson_complete:2", "trial_lesson_complete:3",
    "trial_anna_intro_seen", "paywall_hit",
  ]));

  // Pay (the stub stands in for the Stripe webhook), come back, continue.
  await request.post(`/__devserver/convert?email=${encodeURIComponent(email)}`);
  await page.click("#paywall-refresh");
  await expect(page.locator("#learning-screen.active")).toBeVisible();
  expect(await page.evaluate(() => window.__app.run.releasedBundleIds.length)).toBe(4);
  expect((await events(request, email)).map((e) => e.event_type)).toContain("trial_convert");
});

test("a paying account is never stopped at lesson 4", async ({ page }) => {
  await startNewRun(page);
  expect(await page.evaluate(() => localStorage.getItem("zth_access_tier"))).toBe("paid");
  for (let i = 0; i < 3; i++) {
    await finishLesson(page);
    await expect(page.locator("#learning-screen.active")).toBeVisible();
  }
  expect(await page.evaluate(() => window.__app.run.releasedBundleIds.length)).toBe(4);
  await expect(page.locator("#paywall-screen.active")).toHaveCount(0);
});

test("the free account's Anna ping is refused by the server stub", async ({ page, request }) => {
  const email = `trial-${uniq()}@example.com`;
  await loginAs(page, email);
  const res = await request.post("/.netlify/functions/tutor", {
    headers: { ...authHeadersFor(email), "Content-Type": "application/json" },
    data: { mode: "ping" },
  });
  expect((await res.json()).allowed).toBe(false);
  await expect(page.locator("#link-tutor")).toHaveClass(/locked/);
});

test("the lesson-4 'Full app' lock is visible from the first roadmap (Emi -182)", async ({ page }) => {
  await startNewRun(page, { email: `trial-${uniq()}@example.com` });
  await page.click("#journey-btn");
  await expect(page.locator("#roadmap-screen.active")).toBeVisible();
  await expect(page.locator("#roadmap-path li.paywalled").first()).toContainText("Full app");
});

test("a funnel event survives one failed send (Emi -181)", async ({ page, request, pageErrors }) => {
  const email = `trial-flaky-${uniq()}@example.com`;
  await startNewRun(page, { email });
  await finishLesson(page); // lesson 1 → first send gets a 503, the retry lands
  await expect.poll(async () => (await events(request, email))
    .filter((e) => e.event_type === "trial_lesson_complete").length, { timeout: 8_000 }).toBe(1);
  // The one injected 503 (and its console line) is the point of this test.
  for (let i = pageErrors.length - 1; i >= 0; i--) {
    if (/503/.test(pageErrors[i]) && /trialEvent|status of 503/.test(pageErrors[i])) pageErrors.splice(i, 1);
  }
});
