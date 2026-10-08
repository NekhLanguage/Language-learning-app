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

// Weekly tab (Nekh 2026-10-08): "This week" shows what each learner gained
// since Monday; the dev server mirrors the users_lb_weekly trigger (the
// first save of the week sets the starting point).
test("This week shows what was gained since the week's first save; All time keeps the totals", async ({ page }) => {
  const email = uniqueEmail("weekly");
  await loginAs(page, email);
  const save = (mastered) => page.request.post("/.netlify/functions/saveUser", {
    headers: { ...authHeadersFor(email), "Content-Type": "application/json" },
    data: {
      user: {
        runs: {
          uk: {
            progress: Object.fromEntries(
              ["WATER", "EAT", "BOOK", "SLEEP", "DRINK"].map((cid, i) => [cid, { level: 7, completed: i < mastered, provenance: "pack" }])
            ),
          },
        },
      },
    },
  });
  expect((await save(3)).ok()).toBe(true); // the week starts here: 3 already mastered
  expect((await save(5)).ok()).toBe(true); // two more this week

  await openBoard(page);
  const name = uniqueName("Weekly");
  await page.fill("#leaderboard-name", name);
  await page.click("#leaderboard-join");
  await expect(page.locator(".leaderboard-row.is-me .leaderboard-words")).toHaveText("5");

  await page.click('.leaderboard-period[data-period="week"]');
  await expect(page.locator('.leaderboard-period[data-period="week"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".leaderboard-week-note")).toContainText("Monday");
  await expect(page.locator(".leaderboard-row.is-me .leaderboard-words")).toHaveText("2");
  await expect(page.locator(".leaderboard-me")).toContainText("This week: 2 words mastered");

  // Back to All time: the totals, without another request.
  const requests = [];
  page.on("request", (req) => { if (req.url().includes("/functions/leaderboard")) requests.push(req.url()); });
  await page.click('.leaderboard-period[data-period="all"]');
  await expect(page.locator(".leaderboard-row.is-me .leaderboard-words")).toHaveText("5");
  expect(requests).toEqual([]);
});

test("the default board makes one request; the weekly one is fetched only when opened", async ({ page }) => {
  const calls = [];
  page.on("request", (req) => { if (req.url().includes("/functions/leaderboard")) calls.push(req.url()); });
  await loginAs(page, uniqueEmail("lazy"));
  await openBoard(page);
  await expect(page.locator(".leaderboard-standing")).toBeVisible();
  expect(calls.length).toBe(1);
  expect(calls[0]).not.toContain("period=week");
  await page.click('.leaderboard-period[data-period="week"]');
  await expect.poll(() => calls.some((u) => u.includes("period=week"))).toBe(true);
});

// Nekh 2026-10-08 (screenshot): before the weekly migration ran, opening
// This week replaced the whole board with "Failed to fetch" — no switch, no
// way back to All time. A failed period load now keeps the switch, shows a
// translated message, and the other period still works; pressing the failed
// period again retries.
test("a failed weekly load keeps the switch and the all-time board reachable", async ({ page, pageErrors }) => {
  await loginAs(page, uniqueEmail("weekfail"));
  await openBoard(page);

  let mode = "503";
  await page.route("**/functions/leaderboard?period=week", (route) =>
    mode === "503"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The leaderboard isn't set up yet.", code: "not_migrated" }) })
      : mode === "abort" ? route.abort() : route.continue()
  );

  await page.click('.leaderboard-period[data-period="week"]');
  await expect(page.locator(".leaderboard-error")).toHaveText("The leaderboard isn't set up yet.");
  await expect(page.locator(".leaderboard-periods")).toBeVisible();

  // Back to All time: the board is still there.
  await page.click('.leaderboard-period[data-period="all"]');
  await expect(page.locator(".leaderboard-tabs")).toBeVisible();
  await expect(page.locator(".leaderboard-standing")).toContainText("words mastered");

  // A network failure shows the translated message, not the browser's text.
  mode = "abort";
  await page.click('.leaderboard-period[data-period="week"]');
  await expect(page.locator(".leaderboard-error")).toHaveText("Could not load the leaderboard — please try again.");

  // Pressing This week again retries, and it loads.
  mode = "ok";
  await page.click('.leaderboard-period[data-period="week"]');
  await expect(page.locator(".leaderboard-week-note")).toBeVisible();
  await expect(page.locator(".leaderboard-tabs")).toBeVisible();

  // The 503 and the aborted request above are this test's own doing.
  for (let i = pageErrors.length - 1; i >= 0; i--) {
    if (/leaderboard\?period=week|status of 503|ERR_FAILED|net::/.test(pageErrors[i])) pageErrors.splice(i, 1);
  }
});
