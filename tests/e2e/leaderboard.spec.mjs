// Leaderboard v1 (Nekh 2026-10-02): the start-screen board. The dev server
// computes the counters from the stored blobs with the real
// leaderboardStats.js and keeps display names in memory, so join / rename /
// leave and the counts can be driven end to end.

import { test, expect, loginAs, authHeadersFor } from "./fixtures.mjs";

const uniqueEmail = (tag) => `${tag}-${Math.random().toString(36).slice(2)}@example.com`;
const uniqueName = (tag) => `${tag} ${Math.random().toString(36).slice(2, 7)}`;

async function openBoard(page) {
  await page.click("#link-leaderboard");
  await expect(page.locator("#leaderboard-modal")).toBeVisible();
  await expect(page.locator(".leaderboard-tabs")).toBeVisible();
}

test("nothing about the leaderboard loads at boot; the button fetches the module and the board on demand", async ({ page }) => {
  const requests = [];
  page.on("request", (req) => requests.push(req.url()));
  await loginAs(page, uniqueEmail("boot"));

  const isBoard = (u) => u.includes("leaderboard.mjs") || u.includes("/functions/leaderboard");
  expect(requests.filter(isBoard)).toEqual([]);

  await openBoard(page);
  expect(requests.some((u) => u.includes("leaderboard.mjs"))).toBe(true);
  expect(requests.some((u) => u.includes("/functions/leaderboard"))).toBe(true);
});

test("join with a name, see yourself on the board, rename, leave", async ({ page }) => {
  await loginAs(page, uniqueEmail("join"));
  await openBoard(page);

  // Not joined yet: own counts shown, join form offered.
  await expect(page.locator(".leaderboard-standing")).toContainText("0 words mastered");
  await expect(page.locator("#leaderboard-join")).toHaveText("Join");

  const name = uniqueName("Learner");
  await page.fill("#leaderboard-name", name);
  await page.click("#leaderboard-join");

  await expect(page.locator(".leaderboard-row.is-me")).toContainText(name);
  await expect(page.locator(".leaderboard-standing")).toContainText(`as ${name}`);
  await expect(page.locator("#leaderboard-join")).toHaveText("Rename");

  // Rename.
  const renamed = uniqueName("Renamed");
  await page.fill("#leaderboard-name", renamed);
  await page.click("#leaderboard-join");
  await expect(page.locator(".leaderboard-row.is-me")).toContainText(renamed);
  await expect(page.locator(".leaderboard-row", { hasText: name })).toHaveCount(0);

  // Survives a reload (the name lives on the server, not in this tab).
  await page.reload();
  await page.waitForFunction(() => !!window.__app);
  await openBoard(page);
  await expect(page.locator(".leaderboard-standing")).toContainText(`as ${renamed}`);

  // Leave: no longer listed, join form back.
  await page.click("#leaderboard-leave");
  await expect(page.locator("#leaderboard-join")).toHaveText("Join");
  await expect(page.locator(".leaderboard-row", { hasText: renamed })).toHaveCount(0);
});

test("the counters come from the saved progress: level-7 completions and Anna's words", async ({ page }) => {
  const email = uniqueEmail("counts");
  await loginAs(page, email);

  // Store a blob for this learner the way the app would (the function
  // computes the counters from it): one word mastered at L7, one tutor
  // word still on the ladder, two captured with Anna.
  const res = await page.request.post("/.netlify/functions/saveUser", {
    headers: { ...authHeadersFor(email), "Content-Type": "application/json" },
    data: {
      user: {
        runs: {
          uk: {
            releasedBundleIds: ["b1"],
            progress: {
              WATER: { level: 7, completed: true, provenance: "pack" },
              BOOK: { level: 7, completed: false, provenance: "pack" },
              HELLO: { level: 4, completed: true, provenance: "pack" },
              TUTOR_KAVA: { level: 3, completed: false, provenance: "tutor" },
            },
            personalVocab: [{ word: "вікно" }],
            pendingAdmission: [{ word: "двері" }],
          },
        },
      },
    },
  });
  expect(res.ok()).toBe(true);

  await openBoard(page);
  await expect(page.locator(".leaderboard-standing")).toContainText("1 word mastered");
  await expect(page.locator(".leaderboard-standing")).toContainText("3 words with Anna");

  const name = uniqueName("Counter");
  await page.fill("#leaderboard-name", name);
  await page.click("#leaderboard-join");
  // Both counts sit on the row, whichever ordering is selected — the Anna
  // count must never be hidden behind the second tab.
  const me = page.locator(".leaderboard-row.is-me");
  await expect(me.locator(".leaderboard-words")).toHaveText("1");
  await expect(me.locator(".leaderboard-anna")).toHaveText("3");
  await expect(me.locator(".leaderboard-words")).toHaveClass(/is-sort/);
  await expect(page.locator(".leaderboard-standing")).toContainText("#1 for words mastered");
  await expect(page.locator(".leaderboard-standing")).toContainText("#1 for words with Anna");

  await page.click('.leaderboard-tab[data-tab="anna"]');
  await expect(me.locator(".leaderboard-anna")).toHaveText("3");
  await expect(me.locator(".leaderboard-anna")).toHaveClass(/is-sort/);
  await expect(me.locator(".leaderboard-words")).toHaveText("1");
});

test("a name another learner holds is refused with a message, and the form stays usable", async ({ page, pageErrors }) => {
  const taken = uniqueName("Taken");
  const other = uniqueEmail("other");
  const claim = await page.request.post("/.netlify/functions/leaderboard", {
    headers: { ...authHeadersFor(other), "Content-Type": "application/json" },
    data: { name: taken },
  });
  expect(claim.ok()).toBe(true);

  await loginAs(page, uniqueEmail("dup"));
  await openBoard(page);
  await page.fill("#leaderboard-name", taken.toUpperCase());
  await page.click("#leaderboard-join");
  await expect(page.locator("#leaderboard-status")).toContainText("already taken");
  await expect(page.locator("#leaderboard-join")).toBeEnabled();

  // The 409 is the expected outcome of this test, not an app error: drop
  // the response entry and the browser's own console line for it.
  const idx = pageErrors.findIndex((e) => e.startsWith("http 409:") && e.includes("/functions/leaderboard"));
  expect(idx).toBeGreaterThanOrEqual(0);
  pageErrors.splice(idx, 1);
  const consoleIdx = pageErrors.findIndex((e) => e.startsWith("console:") && e.includes("409"));
  if (consoleIdx >= 0) pageErrors.splice(consoleIdx, 1);
});
