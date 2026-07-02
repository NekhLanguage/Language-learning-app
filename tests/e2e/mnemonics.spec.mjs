// Mnemonic word notes: exposure cards show a per-word memory hook when one
// exists for the (concept, target, support) triple. Notes are optional data —
// the test hunts through several exposures for one that carries a note.

import { test, expect, startNewRun, seedAllConceptsAt } from "./fixtures.mjs";

test("exposure card shows a mnemonic note when one exists", async ({ page }) => {
  // Self-activating: skip while word_notes.json has no content yet.
  const res = await page.request.get("/word_notes.json");
  const data = res.ok() ? await res.json() : null;
  test.skip(!data || Object.keys(data.notes || {}).length === 0, "no word-note content yet");

  await startNewRun(page); // Portuguese target, English support
  // Release several bundles of core vocab so plenty of noted words are in play.
  await seedAllConceptsAt(page, 1, { bundles: 4 });

  let note = null;
  for (let i = 0; i < 10; i++) {
    note = await page.evaluate(() => window.__app.lastExercise?.note || null);
    if (note) break;
    await page.click("#continue-btn");
  }

  expect(note, "no exposure with a mnemonic note found in 10 cards").toBeTruthy();
  const noteEl = page.locator(".word-note");
  await expect(noteEl).toBeVisible();
  expect((await noteEl.innerText()).length).toBeGreaterThan(10);
});
