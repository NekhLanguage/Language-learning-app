// Every exercise fits a small phone (Nekh 2026-10-21: «помаранчевий» ran off
// the right edge of the L5 matching column, and QUIT scrolled out of view).
// Each level is rendered at 360px wide, every option/tile button gets the
// longest single word any language ships (ru «достопримечательность», 21
// letters), and no button — and no text inside one — may stick out.

import { test, expect, startNewRun, seedAllConceptsAt } from "./fixtures.mjs";

const LONGEST = "достопримечательность";

for (const level of [2, 3, 4, 5, 6]) {
  test(`level ${level}: long words stay on a 360px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await startNewRun(page);
    await seedAllConceptsAt(page, level, level >= 6 ? { restrictTypes: ["pronoun", "verb", "noun"] } : {});
    await expect(page.locator("#content button").first()).toBeVisible();
    await page.evaluate((word) => {
      for (const b of document.querySelectorAll("#content button"))
        if (!b.classList.contains("tts-inline") && !b.id && b.textContent.trim()) b.textContent = word;
    }, LONGEST);
    // The app refits text on the next frame after a content change.
    await page.waitForTimeout(150);
    const problems = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll("#content button")]
        .filter((b) => !b.classList.contains("tts-inline") && !b.id && b.offsetParent) // options/tiles, not Check
        .flatMap((b) => {
          const r = b.getBoundingClientRect();
          const out = [];
          if (r.left < -1 || r.right > vw + 1) out.push(`button at ${Math.round(r.left)}–${Math.round(r.right)}`);
          if (b.scrollWidth > b.clientWidth + 1) out.push(`text wider than its button (${b.scrollWidth} > ${b.clientWidth})`);
          // A single word broken over two lines must break at a hyphen
          // (soft hyphen), never silently — it would read as two words.
          const range = document.createRange();
          range.selectNodeContents(b);
          const lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size;
          if (lines > 1 && !b.textContent.includes(" ") && !b.textContent.includes("\u00AD")) out.push("word split without a hyphen");
          return out;
        });
    });
    expect(problems).toEqual([]);
    // The page itself never needs a sideways scroll, and QUIT is on screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const quit = await page.locator("#quit-learning").boundingBox();
    expect(quit.y).toBeGreaterThanOrEqual(0);
  });
}
