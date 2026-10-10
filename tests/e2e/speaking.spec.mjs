// Speaking practice: the exposure card offers a mic button (when the
// browser has SpeechRecognition) that recognizes the learner's speech and
// shows a per-word diff against the target sentence.

import { test, expect, startNewRun, seedAllConceptsAt } from "./fixtures.mjs";

function mockRecognition() {
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => {
        if (window.__mockError) this.onerror?.({ error: window.__mockError });
        else this.onresult?.({ results: [[{ transcript: window.__mockTranscript || "" }]] });
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

test("a missed word shows what was heard", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);

  await page.evaluate(() => { window.__mockTranscript = "xyzzy"; });
  await page.click("#speak-check-btn");

  await expect(page.locator("#spoken-diff .spoken-heard")).toContainText("xyzzy");
});

test("a blocked microphone gets a message, not a bare ellipsis", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);

  await page.evaluate(() => { window.__mockError = "not-allowed"; });
  await page.click("#speak-check-btn");

  await expect(page.locator("#spoken-diff .spoken-error")).toContainText("microphone is blocked");
  await expect(page.locator("#speak-check-btn")).toBeEnabled();
});

test("silence asks the learner to try again", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);

  await page.evaluate(() => { window.__mockError = "no-speech"; });
  await page.click("#speak-check-btn");

  await expect(page.locator("#spoken-diff .spoken-error")).toContainText("didn't hear anything");
});

test("L7 offers Say it once the answer is checked", async ({ page }) => {
  await page.addInitScript(mockRecognition);
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#l7-input")).toBeVisible();
  await expect(page.locator("#speak-check-btn")).toHaveCount(0);

  const { answer } = await page.evaluate(() => window.__app.lastExercise);
  await page.evaluate((s) => { window.__mockTranscript = s; }, answer);
  await page.fill("#l7-input", "completely wrong answer");
  await page.click("#check-l7");

  await page.click("#l7-feedback #speak-check-btn");
  await expect(page.locator("#spoken-diff .spoken-miss")).toHaveCount(0);
  await expect(page.locator("#spoken-diff .spoken-verdict")).toContainText("Every word");
});
