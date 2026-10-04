// Email consent (Austin via Nekh 2026-10-04): the free sign-up form asks
// with an unticked box; a first-time Google sign-in is asked once in the
// app; only a ticked answer ever reaches MailerLite (the dev server's
// stub list, see tests/dev-server.mjs). Emails containing "trial" are
// free-tier accounts in the stub.

import { test, expect, loginAs } from "./fixtures.mjs";

const uniq = () => Math.random().toString(36).slice(2);

async function optins(request) {
  return (await request.get("/__devserver/optins")).json();
}

async function signUpFree(page, email, { tick }) {
  await page.goto("/?start=free");
  const box = page.locator("#start-free-optin");
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.fill("#start-free-email", email);
  if (tick) await box.check();
  await page.click("#start-free-btn");
  await expect(page.locator("#start-free-message")).toContainText("inbox");
}

test("free sign-up: the weekly-email box is unticked; an unticked sign-up never reaches MailerLite and is not asked again", async ({ page, request }) => {
  const email = `trial-unticked-${uniq()}@example.com`;
  await signUpFree(page, email, { tick: false });
  // The first verified sign-in creates the free-tier row with the form's answer.
  await loginAs(page, email);
  const state = await optins(request);
  expect(state.optIns[email].optInAt).toBeNull();
  expect(state.optIns[email].askedAt).toBeTruthy();
  expect(state.mailerlite).not.toContain(email);
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
});

test("free sign-up with the box ticked lands in app-trial on the first verified sign-in", async ({ page, request }) => {
  const email = `trial-ticked-${uniq()}@example.com`;
  await signUpFree(page, email, { tick: true });
  await loginAs(page, email);
  const state = await optins(request);
  expect(state.optIns[email].optInAt).toBeTruthy();
  expect(state.mailerlite).toContain(email);
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
});

async function signInWithGoogleAs(page, email) {
  await page.goto("/");
  await page.evaluate((e) => localStorage.setItem("zth_auth_stub_google_email", e), email);
  await page.click("#google-btn");
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem("zth_email")).catch(() => null),
    { timeout: 10_000 }
  ).toBe(email);
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15_000 });
}

test("a first-time Google sign-in is asked once; ticking it hands the address to app-trial; a reload does not ask again", async ({ page, request }) => {
  const email = `google.trial.${uniq()}@example.com`;
  await signInWithGoogleAs(page, email);
  const modal = page.locator("#email-optin-modal");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#email-optin-box")).not.toBeChecked();
  await page.check("#email-optin-box");
  await page.click("#email-optin-continue");
  await expect(modal).toHaveCount(0);
  const state = await optins(request);
  expect(state.optIns[email].optInAt).toBeTruthy();
  expect(state.optIns[email].source).toBe("prompt");
  expect(state.mailerlite).toContain(email);
  await page.reload();
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15_000 });
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
});

test("a first-time Google sign-in that leaves the box unticked is recorded as asked and never reaches MailerLite", async ({ page, request }) => {
  const email = `google.trial.no.${uniq()}@example.com`;
  await signInWithGoogleAs(page, email);
  await expect(page.locator("#email-optin-modal")).toBeVisible({ timeout: 10_000 });
  await page.click("#email-optin-continue");
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
  const state = await optins(request);
  expect(state.optIns[email].askedAt).toBeTruthy();
  expect(state.optIns[email].optInAt).toBeNull();
  expect(state.mailerlite).not.toContain(email);
  await page.reload();
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15_000 });
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
});

test("a paying account is never asked, and the sign-in form itself has no box", async ({ page }) => {
  await loginAs(page, `paid-${uniq()}@example.com`);
  await expect(page.locator("#email-optin-modal")).toHaveCount(0);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator("#login-form input[type=checkbox]")).toHaveCount(0);
  await expect(page.locator("#link-buy-access")).toHaveText("Get the app for $19, first month of Anna included");
});
