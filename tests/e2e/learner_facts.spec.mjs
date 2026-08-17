// Learner-facts store: end-to-end verification that the tutor page reads
// stored facts into the request body and writes new facts from the summary
// back into the persisted USER blob.

import { test, expect, startNewRun } from "./fixtures.mjs";

async function seedLearnerFacts(page, facts) {
  await page.evaluate((facts) => {
    const u = JSON.parse(localStorage.getItem("zth_user") || "{}");
    u.learnerFacts = facts;
    localStorage.setItem("zth_user", JSON.stringify(u));
  }, facts);
}

test("tutor page sends stored learnerFacts in the request body", async ({ page }) => {
  await startNewRun(page);
  await seedLearnerFacts(page, [
    { text: "learner is Norwegian teaching in Norway", source: "tutor", addedAt: "2026-08-16" },
    { text: "main target language is Ukrainian", source: "tutor", addedAt: "2026-08-16" },
  ]);

  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  // First-visit setup panel — accept defaults and start the chat.
  await page.click("#tutor-settings-save");

  const chatReq = page.waitForRequest((req) => {
    if (req.method() !== "POST" || !req.url().includes("/.netlify/functions/tutor")) return false;
    try {
      return JSON.parse(req.postData() || "{}").mode === "chat";
    } catch {
      return false;
    }
  });

  await page.fill("#tutor-input", "hello");
  await page.click("#tutor-send");

  const req = await chatReq;
  const body = JSON.parse(req.postData() || "{}");
  expect(body.learnerFacts).toContain("learner is Norwegian teaching in Norway");
  expect(body.learnerFacts).toContain("main target language is Ukrainian");
  // Rendered as a bullet list — verify the format the function expects.
  expect(body.learnerFacts.split("\n").every((l) => l.startsWith("- "))).toBe(true);
});

test("memory panel lists stored learnerFacts and removes on ✕ click", async ({ page }) => {
  await startNewRun(page);
  await seedLearnerFacts(page, [
    { text: "learner is Norwegian teaching in Norway", source: "tutor", addedAt: "2026-08-16" },
    { text: "Pokémon is a video-game franchise, not real animals", source: "tutor", addedAt: "2026-08-16" },
    { text: "main target language is Ukrainian", source: "tutor", addedAt: "2026-08-16" },
  ]);

  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");

  // Panel is closed until the header 🧠 button opens it.
  await expect(page.locator("#tutor-memory")).toBeHidden();
  await page.click("#tutor-memory-btn");
  await expect(page.locator("#tutor-memory")).toBeVisible();

  const items = page.locator(".tutor-memory-item");
  await expect(items).toHaveCount(3);
  await expect(items.nth(1)).toContainText("Pokémon is a video-game franchise");

  // Remove the middle row — the store splices and re-renders.
  await items.nth(1).locator(".tutor-memory-remove").click();
  await expect(page.locator(".tutor-memory-item")).toHaveCount(2);

  // The persisted USER blob no longer holds the removed fact.
  const facts = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user") || "{}");
    return u.learnerFacts || [];
  });
  expect(facts.length).toBe(2);
  expect(facts.some((f) => /Pokémon/i.test(f.text))).toBe(false);
  expect(facts.some((f) => /Norwegian/i.test(f.text))).toBe(true);
  expect(facts.some((f) => /Ukrainian/i.test(f.text))).toBe(true);
});

test("memory panel shows empty-state copy when no facts have accrued yet", async ({ page }) => {
  await startNewRun(page);

  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");

  await page.click("#tutor-memory-btn");
  await expect(page.locator("#tutor-memory")).toBeVisible();
  await expect(page.locator(".tutor-memory-empty")).toBeVisible();
  await expect(page.locator(".tutor-memory-item")).toHaveCount(0);
});

test("tutor session summary writes newLearnerFacts back into USER blob", async ({ page }) => {
  await startNewRun(page);

  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");

  // Two turns so the End-session path fires the summary (>= 2 messages).
  await page.fill("#tutor-input", "hello");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1);
  await page.fill("#tutor-input", "how are you");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(2);

  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Session saved." })).toBeVisible();

  const facts = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user") || "{}");
    return u.learnerFacts || [];
  });
  // The dev-stub returns exactly one canned newLearnerFact per summary; the
  // client's applyTutorLearnerFacts landed it under user.learnerFacts.
  expect(facts.length).toBeGreaterThanOrEqual(1);
  expect(facts.some((f) => /learner facts write-path/i.test(f.text))).toBe(true);
});

