// A word removed from the data (CALORIE, Nekh 2026-10-21) may still sit in a
// learner's saved run. The app must keep working: no errors, no raw concept
// id on screen, sessions keep rendering.

import { test, expect, startNewRun } from "./fixtures.mjs";

test("a saved run holding a word that no longer exists keeps working", async ({ page }) => {
  await startNewRun(page, { packId: "fitness" });
  await page.evaluate(() => {
    const run = window.__app.run;
    run.released.push("CALORIE");
    run.progress.CALORIE = { level: 3, completed: false, correct: 2, wrong: 0 };
    window.__app.rerender();
  });
  for (let i = 0; i < 6; i++) {
    await expect(page.locator("#content")).not.toContainText("CALORIE");
    await page.evaluate(() => window.__app.rerender());
  }
  await page.click("#journey-btn");
  await expect(page.locator("body")).not.toContainText("CALORIE");
});
