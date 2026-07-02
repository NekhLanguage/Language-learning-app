// Speaking practice: the exposure card offers a mic button (when the
// browser has SpeechRecognition) that recognizes the learner's speech and
// shows a per-word diff against the target sentence.

import { test, expect, startNewRun } from "./fixtures.mjs";

function mockRecognition() {
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => {
        this.onresult?.({ results: [[{ transcript: window.__mockTranscript || "" }]] });
        this.onend?.();
      }, 20);
    }
    abort() {}
  };
}

test("saying the sentence correctly marks every word green", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);

  const sentence = await page.evaluate(() => window.__app.lastExercise.sentence);
  await page.evaluate((s) => { window.__mockTranscript = s; }, sentence);

  await page.click("#speak-check-btn");
  await expect(page.locator("#spoken-diff .spoken-ok").first()).toBeVisible();
  await expect(page.locator("#spoken-diff .spoken-miss")).toHaveCount(0);

  const spoken = await page.evaluate(() => window.__app.lastExercise.spoken);
  expect(spoken.words.every((w) => w.heard)).toBe(true);
});

test("missed words are marked", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);

  await page.evaluate(() => { window.__mockTranscript = "xyzzy"; });
  await page.click("#speak-check-btn");

  await expect(page.locator("#spoken-diff .spoken-miss").first()).toBeVisible();
});

test("without SpeechRecognition the mic button never shows", async ({ page }) => {
  await page.addInitScript(() => {
    // Ensure detection fails even where headless Chrome defines webkit's.
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
  });
  await startNewRun(page);

  await expect(page.locator("#content h2")).toBeVisible();
  await expect(page.locator("#speak-check-btn")).toHaveCount(0);
});
