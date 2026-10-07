// Anna's page speaks the learner's support language (Nekh 2026-10-06):
// the static markup, the language name, right-to-left for Arabic, and the
// "log in first" gate before any account exists.

import { test, expect, startNewRun } from "./fixtures.mjs";

async function setSupport(page, code) {
  await page.evaluate((c) => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    u.supportLanguage = c;
    u.lastLocalChange = Date.now();
    u.tutor = u.tutor || {};
    u.tutor.updatedAt = Date.now();
    localStorage.setItem("zth_user", JSON.stringify(u));
  }, code);
}

test("the tutor page follows the support language, with English where a string is not translated yet", async ({ page }) => {
  await startNewRun(page);
  await setSupport(page, "ar");
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // tutorIntro is translated in every lang file already.
  const arIntro = await page.evaluate(async () => (await (await fetch("lang/ar.json")).json()).uiStrings.tutorIntro);
  await expect(page.locator("#tutor-intro")).toHaveText(arIntro);
  // The target language's name comes from the support language's hubNames.
  const arName = await page.evaluate(async () => {
    const run = JSON.parse(localStorage.getItem("zth_user")).lastActiveLanguage;
    return (await (await fetch("lang/ar.json")).json()).hubNames[run];
  });
  await expect(page.locator("#tutor-lang-label")).toContainText(arName);
  // Every static label resolved to text (never a raw key).
  const labels = await page.locator("[data-i18n]").allTextContents();
  for (const l of labels) expect(l).not.toMatch(/^tutor[A-Z]\w+$/);
});

test("the log-in-first gate uses the device's remembered language", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#gate-lang", "de");
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-gate")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#tutor-gate a")).toHaveAttribute("href", "index.html");
  await page.waitForLoadState("networkidle");
});
