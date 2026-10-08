// The sign-in screen speaks the learner's support language (Nekh
// 2026-10-06): a picker on the gate, never a browser guess. The pick
// re-renders the gate, becomes the account's support language at the
// sign-in that follows, and outlives a logout on this device.

import { test, expect, openSignIn, TEST_PASSWORD } from "./fixtures.mjs";

test("a fresh device opens in English, on Start free, whatever the browser locale", async ({ browser }) => {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#gate-lang")).toHaveValue("en");
  await expect(page.locator("#start-free-btn")).toHaveText("Start free");
  await page.waitForLoadState("networkidle");
  await context.close();
});

test("picking a language translates the gate and keeps what was typed", async ({ page }) => {
  await page.goto("/");
  await page.fill("#start-free-email", "typed@example.com");
  await page.selectOption("#gate-lang", "de");

  await expect(page.locator("#start-free-btn")).toHaveText("Kostenlos starten");
  await expect(page.locator("#gate-start-free-heading")).toHaveText("Probier die ersten 6 Lektionen kostenlos");
  await expect(page.locator("#google-btn")).toHaveText("Weiter mit Google");
  await expect(page.locator("#start-free-email")).toHaveValue("typed@example.com");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  // Messages follow the language too, including after a switch.
  await page.click("#gate-to-signin");
  await page.click("#login-btn");
  await expect(page.locator("#gate-message")).toHaveText("Gib deine E-Mail-Adresse und dein Passwort ein.");
  await page.selectOption("#gate-lang", "es");
  await expect(page.locator("#gate-message")).toHaveText("Introduce tu correo y tu contraseña.");
});

test("Arabic turns the gate right-to-left", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#gate-lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#start-free-btn")).toHaveText("ابدأ مجانًا");
});

test("the gate pick becomes the account's support language and survives logout", async ({ page }) => {
  const email = `gate-lang-${Date.now()}@example.com`;
  await page.goto("/");
  await page.selectOption("#gate-lang", "pt");
  await openSignIn(page, null);
  await page.fill("#email-input", email);
  await page.fill("#password-input", TEST_PASSWORD);
  await page.click("#login-btn");
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15_000 });

  const support = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user") || "{}").supportLanguage);
  expect(support).toBe("pt");

  // Log out: account data goes, the language preference stays, and the
  // device now opens on the sign-in form.
  page.once("dialog", (d) => d.accept());
  await page.click("#logout-btn");
  await expect(page.locator("#gate-lang")).toHaveValue("pt", { timeout: 10_000 });
  await expect(page.locator("#login-btn")).toHaveText("Entrar");
  await expect(page.locator("#email-input")).toBeVisible();
  await page.waitForLoadState("networkidle");
});

test("the set-password page follows the device's language and has its own picker", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#gate-lang", "fr");
  await page.goto("/auth.html");
  await expect(page.locator("#auth-heading")).toHaveText("Ce lien a expiré");
  await expect(page.locator("#save-password")).toHaveText("Enregistrer le mot de passe");
  await page.selectOption("#gate-lang", "it");
  await expect(page.locator("#auth-heading")).toHaveText("Questo link è scaduto");
  await expect(page.locator("#auth-message")).toContainText("Apri l'app");
});

test("a malformed email gets its own message, an empty box the old one (Emi -222)", async ({ page }) => {
  await page.goto("/");
  await page.click("#start-free-btn");
  await expect(page.locator("#start-free-message")).toHaveText("Enter your email");
  await page.fill("#start-free-email", "bad@");
  await page.click("#start-free-btn");
  await expect(page.locator("#start-free-message")).toContainText("doesn't look like an email");
});

test("a typed password survives a language switch (Emi -223)", async ({ page }) => {
  await openSignIn(page);
  await page.fill("#password-input", "kept-secret");
  await page.selectOption("#gate-lang", "de");
  await expect(page.locator("#login-btn")).toHaveText("Anmelden");
  await expect(page.locator("#password-input")).toHaveValue("kept-secret");
});

test("an expired set-password link shows the message without a dead form (Emi -229)", async ({ page }) => {
  await page.goto("/auth.html");
  await expect(page.locator("#auth-heading")).toHaveText("This link has expired");
  await expect(page.locator("#password-form")).toBeHidden();
  await expect(page.locator("#auth-message")).toContainText("fresh link");
});
