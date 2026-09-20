// Boot smoke tests: the app loads, gates access, logs in, and reaches the
// language hub — all with zero console/page/network errors (enforced by the
// pageErrors fixture in fixtures.mjs).

import { test, expect, loginAs, TEST_PASSWORD } from "./fixtures.mjs";

test("logged-out visit shows the sign-in screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#email-input")).toBeVisible();
  await expect(page.locator("#password-input")).toBeVisible();
  await expect(page.locator("#login-btn")).toBeVisible();
  await expect(page.locator("#google-btn")).toBeVisible();
  await expect(page.locator("#link-set-password")).toBeVisible();
  await expect(page.locator("#link-buy-access")).toBeVisible();
});

test("a signed-in email without access is rejected with a notice and signed out", async ({ page }) => {
  await page.goto("/");

  await page.fill("#email-input", "noaccess@example.com");
  await page.fill("#password-input", TEST_PASSWORD);
  await page.click("#login-btn");

  await expect(page.locator("#gate-message")).toContainText("No access");
  // Still gated, and no session left behind.
  await expect(page.locator("#email-input")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("zth_auth_stub_session"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("zth_email"))).toBeNull();
});

test("a wrong password never reaches the access check", async ({ page }) => {
  await page.goto("/");

  await page.fill("#email-input", "test@example.com");
  await page.fill("#password-input", "wrongpassword");
  await page.click("#login-btn");

  await expect(page.locator("#gate-message")).toContainText("Wrong email or password");
  await expect(page.locator("#email-input")).toBeVisible();
});

test("set-or-reset password asks for the email first, then confirms", async ({ page }) => {
  await page.goto("/");

  await page.click("#link-set-password");
  await expect(page.locator("#gate-message")).toContainText("Enter your email above first");

  await page.fill("#email-input", "test@example.com");
  await page.click("#link-set-password");
  await expect(page.locator("#gate-message")).toContainText("link to set your password");
  await expect(page.locator("#gate-message")).toHaveClass(/is-ok/);
});

test("Continue with Google returns signed in and lands on the start screen", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("zth_auth_stub_google_email", "Google.Learner@example.com"));

  await page.click("#google-btn");
  // The stub adapter signs in and returns to "/"; boot sees a session for
  // an address this device never used, confirms access, adopts it and
  // reloads. (#start-screen is in the static HTML, so wait for the shim
  // to be written before reading the booted page.)
  // Two navigations happen in a row (return to "/", then the boot reload),
  // so an evaluate can land mid-navigation: treat that as "not yet".
  await expect.poll(
    () => page.evaluate(() => localStorage.getItem("zth_email")).catch(() => null),
    { timeout: 10_000 }
  ).toBe("google.learner@example.com");
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#open-app")).toBeVisible();
});

test("a signed-out session forces the sign-in screen even with local progress", async ({ page }) => {
  await loginAs(page);
  // The hub buttons render only once the versioned lang-file fetch has
  // landed; reloading before that aborts it into a console error.
  await expect(page.locator("#language-buttons button")).toHaveCount(16);

  // Simulate the cutover: the old email shim and local data are present but
  // there is no Supabase session behind them.
  await page.evaluate(() => localStorage.removeItem("zth_auth_stub_session"));
  await page.reload();

  await expect(page.locator("#email-input")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("zth_email"))).toBeNull();
  // Local progress is kept for when the learner signs back in.
  expect(await page.evaluate(() => localStorage.getItem("zth_user"))).not.toBeNull();
  // The gate paints before the lang-file fetch lands; let it finish so
  // closing the page doesn't abort it into a console error.
  await page.waitForLoadState("networkidle");
});

test("Anna stays greyed out without an active subscription", async ({ page }) => {
  await loginAs(page, "nosub-learner@example.com");
  const anna = page.locator("#link-tutor");
  await expect(anna).toHaveClass(/locked/);
  await expect(anna).toHaveAttribute("title", /active subscription/);
});

test("Anna unlocks for a subscribed learner, who also gets the Manage subscription link", async ({ page }) => {
  await loginAs(page, "subscribed-learner@example.com");
  const anna = page.locator("#link-tutor");
  await expect(anna).not.toHaveClass(/locked/, { timeout: 10_000 });
  await expect(anna).toHaveAttribute("href", "tutor.html");
  const manage = page.locator("#link-manage-subscription");
  await expect(manage).toBeVisible();
  await expect(manage).toHaveAttribute("href", /billing\.stripe\.com/);
});

test("no Manage subscription link without an active subscription", async ({ page }) => {
  await loginAs(page, "nosub-learner@example.com");
  await expect(page.locator("#link-tutor")).toHaveClass(/locked/);
  await expect(page.locator("#link-manage-subscription")).toBeHidden();
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

  // 17 registered languages minus the support language (English). Finnish
  // was unhidden 2026-09-06, so nothing is filtered any more.
  await expect(page.locator("#language-buttons button")).toHaveCount(16);
});

test("?showHidden=1 reveals gate-pending languages to QA (and only QA)", async ({ page }) => {
  // The QA hook Emi's run-7 needed: hidden languages are filtered at
  // module load, so without this a sweeper can never test them as the
  // interface language. A plain reload (no query) restores hiding.
  await page.goto("/?showHidden=1");
  await page.fill("#email-input", "showhidden-qa@example.com");
  await page.fill("#password-input", TEST_PASSWORD);
  await page.click("#login-btn");
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });

  await page.click("#open-app");
  await expect(page.locator("#language-screen.active")).toBeVisible();
  // 17 registered minus the support language — with no hidden language
  // left the count matches the plain picker; the hook stays for the next
  // language that lives behind the gate.
  await expect(page.locator("#language-buttons button")).toHaveCount(16);
});


test("a subscriber can accept the referral terms and get a code with a copyable link", async ({ page }) => {
  await loginAs(page, "subscribed-learner@example.com");
  const refer = page.locator("#link-refer");
  await expect(refer).toBeVisible({ timeout: 10_000 });
  await refer.click();
  await expect(page.locator("#referral-modal")).toBeVisible();
  // First open: terms first, button disabled until accepted.
  await expect(page.locator("#referral-get-code")).toBeDisabled();
  await page.check("#referral-accept");
  await page.click("#referral-get-code");
  await expect(page.locator("#referral-code")).toHaveText("ZTH-SUBSCRIB");
  await expect(page.locator("#referral-link")).toHaveValue(/client_reference_id=ZTH-SUBSCRIB$/);
  await expect(page.locator("#referral-active")).toHaveText("0");
  await expect(page.locator("#referral-ytd")).toHaveText("$0.00 of $190.00");
  // Discount-only programme: the card never promises money.
  await expect(page.locator("#referral-body")).not.toContainText(/paid out|cash|get paid|payout/i);
  // Reopening shows the code straight away.
  await page.click("#referral-close");
  await refer.click();
  await expect(page.locator("#referral-code")).toHaveText("ZTH-SUBSCRIB");
});

test("no referral button without an active subscription", async ({ page }) => {
  await loginAs(page, "nosub-learner@example.com");
  await expect(page.locator("#link-tutor")).toHaveClass(/locked/);
  await expect(page.locator("#link-refer")).toBeHidden();
});
