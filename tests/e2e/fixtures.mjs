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
      page.on("requestfailed", (req) =>
        errors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`)
      );
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
