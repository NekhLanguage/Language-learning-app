// -78 (Emi run-16): a lexicon that is empty when an exercise renders must
// never be read as "nothing left to teach". The old loadAndMergeVocab emptied
// window.GLOBAL_VOCAB before fetching, so a failed or superseded load left
// the app with no words: exercises rendered concept ids, and renderNext
// ended a session on every Continue (553 clicks, 0 sessions).

import { test, expect, startNewRun, loginAs } from "./fixtures.mjs";

test("an emptied lexicon is reloaded before rendering, never mistaken for an exhausted run", async ({ page }) => {
  await startNewRun(page);
  const before = await page.evaluate(() => window.__app.run.sessionNumber);

  await page.evaluate(() => {
    window.GLOBAL_VOCAB = { concepts: {}, languages: {} };
    window.__app.rerender();
  });

  await expect(page.locator("#learning-screen.active")).toBeVisible();
  await expect(page.locator("#content h2")).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    Object.keys(window.GLOBAL_VOCAB.concepts).length)).toBeGreaterThan(100);

  const after = await page.evaluate(() => window.__app.run.sessionNumber);
  expect(after).toBe(before);
  // No raw concept ids on the card («HE _ una GOOD verdura» was the symptom).
  const text = await page.locator("#content").innerText();
  expect(text).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
});

test("a vocab file that fails on the first tap keeps the previous lexicon; the next tap enters", async ({ page, pageErrors }) => {
  await loginAs(page, `learner-${Math.random().toString(36).slice(2)}@example.com`);
  await page.click("#open-app");

  // Fail one vocab file once. The entry rejects, the banner says so, and
  // nothing else is disturbed.
  let failed = false;
  await page.route("**/nouns.json*", (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 503, body: "unavailable" });
  });
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await expect(page.locator("#sync-status")).toBeVisible();
  await expect(page.locator("#language-screen.active")).toBeVisible();
  await page.unroute("**/nouns.json*");

  // The second tap goes through: fresh account → reason screen, lexicon loaded.
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await expect(page.locator("#reason-screen.active")).toBeVisible();
  const concepts = await page.evaluate(() => Object.keys(window.GLOBAL_VOCAB.concepts).length);
  expect(concepts).toBeGreaterThan(100);

  // The provoked 503 (the response and the browser's console line for it)
  // is the test's own doing.
  for (let i = pageErrors.length - 1; i >= 0; i--) {
    if (/503/.test(pageErrors[i])) pageErrors.splice(i, 1);
  }
});
