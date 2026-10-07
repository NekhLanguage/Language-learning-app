// Pseudo-locale sweep (Nekh 2026-10-07, the CI guard): every uiStrings
// value of the support language is served wrapped in ⟦…⟧, then each
// screen's visible text is read. Anything left outside the brackets that
// looks like a word is text that never went through uiStrings — a
// hardcoded English string. The 2026-10-06 audit found ~250 of those by
// hand; this keeps new ones from shipping.
//
// Screens without target-language content only (the exercise screen shows
// the language being learned, by design).

import { test, expect, loginAs, startNewRun } from "./fixtures.mjs";

const PSEUDO = "de";

async function servePseudo(page) {
  await page.route(`**/lang/${PSEUDO}.json*`, async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    for (const [k, v] of Object.entries(data.uiStrings || {})) {
      if (typeof v === "string") data.uiStrings[k] = `⟦${v}⟧`;
    }
    // English must not leak through the fallback either: wrap it too, so a
    // key German lacks still shows as bracketed (= keyed) text.
    await route.fulfill({ response: res, json: data });
  });
  await page.route("**/lang/en.json*", async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    for (const [k, v] of Object.entries(data.uiStrings || {})) {
      if (typeof v === "string") data.uiStrings[k] = `⟦${v}⟧`;
    }
    await route.fulfill({ response: res, json: data });
  });
}

// Visible text (and the labels a screen reader reads) outside ⟦…⟧ that
// contains a word. `allow` lists strings that are legitimately not UI text
// (brand, language names, the learner's own data); text directly inside a
// USER_DATA element (display names, referral codes) is never UI text.
const USER_DATA = ".leaderboard-name, .referral-code, .referral-link";
async function unkeyedText(page, rootSelector, allow = []) {
  return page.evaluate(({ rootSelector, allow, userData }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return [`<no ${rootSelector}>`];
    const visible = (el) => !!el && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false && el.getClientRects().length > 0;
    const strip = (s) => {
      let out = "", depth = 0;
      for (const ch of s) {
        if (ch === "⟦") { depth++; continue; }
        if (ch === "⟧") { depth = Math.max(0, depth - 1); continue; }
        if (depth === 0) out += ch;
      }
      return out;
    };
    const bad = [];
    const check = (raw, where) => {
      let rest = strip(raw);
      for (const a of allow) rest = rest.split(a).join(" ");
      if (/[A-Za-z]{3,}/.test(rest)) bad.push(`${where}: ${raw.trim().slice(0, 80)}`);
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!visible(el) || el.closest("script,style,[hidden]") || el.matches(userData)) continue;
      check(n.textContent, el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(" ")[0]}` : el.tagName.toLowerCase());
    }
    for (const el of root.querySelectorAll("[placeholder],[aria-label],[title]")) {
      if (!visible(el)) continue;
      for (const attr of ["placeholder", "aria-label", "title"]) {
        const v = el.getAttribute(attr);
        if (v) check(v, `${el.id ? "#" + el.id : el.tagName.toLowerCase()}[${attr}]`);
      }
    }
    return bad;
  }, { rootSelector, allow, userData: USER_DATA });
}

// Language names (native labels and the support language's hubNames) are
// data, not UI text; so are the brand and the version tag.
async function languageNames(page) {
  return page.evaluate(async (code) => {
    const { AVAILABLE_LANGUAGES } = await import("/languages.js");
    const hub = (await (await fetch(`/lang/${code}.json`)).json()).hubNames || {};
    return [...AVAILABLE_LANGUAGES.map((l) => l.nativeLabel), ...AVAILABLE_LANGUAGES.map((l) => l.label), ...Object.values(hub)]
      .filter(Boolean).sort((a, b) => b.length - a.length);
  }, PSEUDO);
}

const BRAND = ["ZERO TO HERO", "Zero to Hero"];

test("sign-in screen and set-password page: no unkeyed text", async ({ page }) => {
  await servePseudo(page);
  await page.goto("/");
  await page.selectOption("#gate-lang", PSEUDO);
  await expect(page.locator("#start-free-btn")).toContainText("⟦");
  const names = await languageNames(page);
  expect(await unkeyedText(page, ".gate-screen", [...BRAND, ...names])).toEqual([]);
  await page.click("#gate-to-signin");
  expect(await unkeyedText(page, ".gate-screen", [...BRAND, ...names])).toEqual([]);

  await page.goto("/auth.html");
  await expect(page.locator("#auth-heading")).toContainText("⟦");
  expect(await unkeyedText(page, ".gate-screen", [...BRAND, ...names])).toEqual([]);
});

test("start screen, language hub, leaderboard and referral card: no unkeyed text", async ({ page }) => {
  await servePseudo(page);
  const email = `pseudo-${Date.now()}@example.com`;
  await loginAs(page, email);
  await page.click("#support-pill");
  await page.locator(".support-option", { hasText: "Deutsch" }).click();
  await expect(page.locator("#open-app")).toContainText("⟦");
  const names = await languageNames(page);
  const allow = [...BRAND, ...names, "DE", email];

  // Let the Anna ping settle the start-screen buttons (label, tooltip,
  // Refer a friend). The app keeps background requests going, so no
  // networkidle here.
  await page.waitForTimeout(1500);
  expect(await unkeyedText(page, "#start-screen", allow)).toEqual([]);

  await page.click("#link-leaderboard");
  await expect(page.locator("#leaderboard-title")).toContainText("⟦");
  expect(await unkeyedText(page, "#leaderboard-modal", allow)).toEqual([]);
  await page.click("#leaderboard-close");

  if (await page.locator("#link-refer").isVisible()) {
    await page.click("#link-refer");
    await expect(page.locator("#referral-get-code, #referral-copy").first()).toBeVisible();
    expect(await unkeyedText(page, "#referral-modal", allow)).toEqual([]);
    await page.click("#referral-close");
  }

  await page.click("#open-app");
  await expect(page.locator("#language-screen")).toBeVisible();
  expect(await unkeyedText(page, "#language-screen", allow)).toEqual([]);
});

test("Anna's page: no unkeyed text", async ({ page }) => {
  await servePseudo(page);
  await startNewRun(page);
  await page.evaluate((code) => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    u.supportLanguage = code;
    u.lastLocalChange = Date.now();
    u.tutor = u.tutor || {};
    u.tutor.updatedAt = Date.now();
    localStorage.setItem("zth_user", JSON.stringify(u));
  }, PSEUDO);
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-settings")).toBeVisible();
  await expect(page.locator("#tutor-settings-save")).toContainText("⟦");
  const names = await languageNames(page);
  // The header carries the version tag (v1.2.x).
  expect(await unkeyedText(page, ".tutor-wrap", [...BRAND, ...names, "Anna"])).toEqual([]);
});
