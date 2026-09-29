// The End-session summary must send the SAME memory block as the chat
// turns did (Nekh 2026-09-29): End session saves a placeholder record
// before asking Anna for the notes, and including it changed the system
// prompt, so every summary rewrote the whole cached prefix (12k
// cache-write tokens, 3 of its 4.7 cents). The placeholder is left out.

import { test, expect, startNewRun } from "./fixtures.mjs";

test("the summary request carries the conversation's memory, not the just-saved placeholder", async ({ page }) => {
  await startNewRun(page, { email: `beta-cache-${Date.now()}@example.com` });
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");

  const bodies = [];
  page.on("request", (req) => {
    if (/\/tutor(Stream)?$/.test(req.url()) && req.method() === "POST") bodies.push(req.postDataJSON());
  });
  await page.locator("#tutor-topics .tutor-topic-free").click();
  await page.fill("#tutor-input", "olá");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Session saved. Your tutor will remember this next time." })).toBeVisible({ timeout: 15_000 });

  const chat = bodies.find((b) => b.mode === "chat");
  const summary = bodies.find((b) => b.mode === "summary");
  expect(chat && summary).toBeTruthy();
  expect(summary.memory).toBe(chat.memory);
  expect(summary.memory).not.toContain("still being written");
  expect(summary.topics).toBe(chat.topics);
  expect(summary.profile).toBe(chat.profile);
  expect(summary.learnerFacts).toBe(chat.learnerFacts);
});
