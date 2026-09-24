// Conversation topics for Anna (beta, Nekh 2026-09-24). Beta testers pick
// what a conversation is about before it starts; Anna files the session
// under a topic at the end and can propose broader topics, asked as yes/no
// questions. Everyone else sees Anna exactly as before. The dev server
// turns beta on for emails containing "beta" (production: BETA_EMAILS).

import { test, expect, startNewRun } from "./fixtures.mjs";

async function openTutor(page) {
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");
}

const storedTutor = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("zth_user") || "{}").tutor);

test("a beta tester picks a topic, Anna files the session and proposes a broader one", async ({ page }) => {
  await startNewRun(page, { email: `beta-${Date.now()}@example.com` });
  await openTutor(page);

  const picker = page.locator("#tutor-topics");
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("What do you want to talk about?");

  // New topic from the picker.
  await picker.locator("input").fill("One Piece");
  await picker.locator("button[type=submit]").click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator("#tutor-lang-label")).toContainText("One Piece");

  await page.fill("#tutor-input", "oi");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });

  await page.click("#tutor-end");
  // Picker is back for the next conversation straight away.
  await expect(page.locator("#tutor-topics")).toBeVisible();
  await expect(page.locator(".tutor-msg.status", { hasText: "Filed under your topic: One Piece." })).toBeVisible({ timeout: 15_000 });

  // Anna's proposal, asked as a question.
  const proposal = page.locator("#tutor-topic-proposal");
  await expect(proposal).toContainText("Books in general");
  await proposal.getByRole("button", { name: /Yes/ }).click();
  await expect(proposal).toHaveCount(0);

  const tutor = await storedTutor(page);
  const books = tutor.topics.find((t) => t.name === "Books in general");
  const op = tutor.topics.find((t) => t.name === "One Piece");
  expect(books).toBeTruthy();
  expect(op.parentId).toBe(books.id);
  expect(op.notes).toContain("chapter 1");
  expect(op.sessions).toBe(1);
  expect(tutor.topicProposals).toEqual([]);
  expect(tutor.memory.pt.sessions[0].topicId).toBe(op.id);

  // The picker shows the nested tree; choosing the topic resumes it.
  const rows = page.locator("#tutor-topics .tutor-topic");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Books in general");
  await expect(rows.nth(1)).toContainText("One Piece · 1");
  await rows.nth(1).click();
  await expect(page.locator(".tutor-msg.status", { hasText: "pick up where you left off" })).toBeVisible();
});

test("a free conversation is filed under a topic Anna names", async ({ page }) => {
  await startNewRun(page, { email: `beta-free-${Date.now()}@example.com` });
  await openTutor(page);
  await expect(page.locator("#tutor-topics")).toBeVisible();
  // Typing without picking = free conversation.
  await page.fill("#tutor-input", "oi");
  await page.click("#tutor-send");
  await expect(page.locator("#tutor-topics")).toHaveCount(0);
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Anna started a new topic for this conversation: Dev stub topic." })).toBeVisible({ timeout: 15_000 });
  // No existing topics to group, but the proposal still asks; decline it.
  await page.locator("#tutor-topic-proposal").getByRole("button", { name: "No thanks" }).click();
  const tutor = await storedTutor(page);
  expect(tutor.topics.map((t) => t.name)).toEqual(["Dev stub topic"]);
  expect(tutor.topicProposals).toEqual([]);
});

test("non-beta learners see no topics and send none", async ({ page }) => {
  const bodies = [];
  page.on("request", (req) => {
    if (/\/tutor(Stream)?$/.test(req.url()) && req.method() === "POST") bodies.push(req.postDataJSON());
  });
  await startNewRun(page);
  await openTutor(page);
  await page.fill("#tutor-input", "oi");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator("#tutor-topics")).toHaveCount(0);
  expect(bodies.some((b) => b && "topics" in b)).toBe(false);
});
