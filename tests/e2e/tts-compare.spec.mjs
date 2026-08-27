// Instrumentation comparison for Emi bug 2026-08-26-13: does the inline
// "Play audio" path fire a TTS request for Italian the same way it does
// for Japanese? Counts BROWSER-level requests (Audio element fetches are
// visible here but invisible to JS fetch/XHR patching).
import { test, expect } from "./fixtures.mjs";
import { startNewRun } from "./fixtures.mjs";

for (const language of ["Italian", "Japanese"]) {
  test(`inline TTS fires a request for ${language}`, async ({ page, pageErrors }) => {
    const ttsRequests = [];
    page.on("request", (req) => {
      if (req.url().includes("tts")) ttsRequests.push(req.url());
    });
    await startNewRun(page, { language });
    // First exercise rendered — find any inline speaker button and click it.
    const btn = page.locator(".tts-inline").first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const before = ttsRequests.length; // prefetch may already have fired
    await btn.click();
    await page.waitForTimeout(1200);
    console.log(`[${language}] tts requests: before-click(prefetch)=${before}, total=${ttsRequests.length}`,
      ttsRequests.slice(0, 3));
    expect(ttsRequests.length).toBeGreaterThan(0);
  });
}
