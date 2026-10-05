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

// --- The Opinions subject (Nekh 2026-10-05) -------------------------------------
// A built-in first row that rolls a discussion theme every time; the
// session files under the Opinions topic with the theme tagged, Anna's
// themeNote lands on the record, and a repeat theme carries the previous
// note into the request.

const seedThemeSessions = (page) =>
  page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem("zth_user") || "{}");
    user.tutor = user.tutor || {};
    user.tutor.memory = user.tutor.memory || {};
    const themes = [
      "social_media", "time_vs_money", "phones_school", "big_city", "other_cultures", "learning_language",
      "travel_environment", "working_home", "exercise", "good_life", "neighbours", "owning_car",
      "family_dinner", "good_workplace", "city_country", "screen_time", "choosing_career", "family_contact",
    ];
    const sessions = [{ when: "2026-09-20", themeId: "homework", sessionSummary: "Homework chat.", themeNote: "Seeded note: argued for less homework.", struggles: [], nextFocus: "" }];
    for (const id of themes) for (const when of ["2026-09-10", "2026-09-01"]) sessions.push({ when, themeId: id, sessionSummary: `Seeded ${id}.`, struggles: [], nextFocus: "" });
    user.tutor.memory.pt = { sessions };
    user.tutor.updatedAt = Date.now();
    localStorage.setItem("zth_user", JSON.stringify(user));
  });

test("Opinions is the first row: it rolls a theme, files the session and keeps Anna's theme note", async ({ page }) => {
  const bodies = [];
  page.on("request", (req) => {
    if (/\/tutor(Stream)?$/.test(req.url()) && req.method() === "POST") bodies.push(req.postDataJSON());
  });
  await startNewRun(page, { email: `beta-opinions-${Date.now()}@example.com` });
  await openTutor(page);

  const picker = page.locator("#tutor-topics");
  await expect(picker).toBeVisible();
  const first = picker.locator(".tutor-topic-row button").first();
  await expect(first).toHaveClass(/tutor-topic-opinions/);
  await expect(first).toContainText("Opinions");
  await expect(first).toContainText("0 of 19 themes · 0 conversations");

  await first.click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator("#tutor-lang-label")).toContainText("Opinions ·");
  await expect(page.locator(".tutor-msg.status", { hasText: "new theme" })).toBeVisible();
  const label = await page.locator("#tutor-lang-label").textContent();
  const theme = label.split(" · ").at(-1).trim();
  expect(theme.length).toBeGreaterThan(3);

  await page.fill("#tutor-input", "oi");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  // The reply must be fully in (and saved to the live transcript) before the
  // reload below; the bubble exists while it is still streaming.
  await expect(page.locator(".tutor-msg.assistant")).not.toHaveClass(/streaming/);
  const chat = bodies.find((b) => b.mode === "chat");
  expect(chat.activeTopic).toBe("Opinions");
  expect(chat.topicBrief).toMatch(/\?$/);
  expect(chat.topics).toContain(`THIS CONVERSATION'S BRIEF: ${chat.topicBrief}`);
  expect(chat.topics).toContain("1st conversation on it");

  // Reload mid-conversation: the theme survives with the transcript.
  await page.reload();
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1);
  await expect(page.locator("#tutor-lang-label")).toContainText(theme);

  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Filed under your topic: Opinions." })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".tutor-msg.status", { hasText: "Anna's note on this theme: Dev-stub theme note" })).toBeVisible();
  const summary = bodies.find((b) => b.mode === "summary");
  expect(summary.topics).toBe(chat.topics);
  expect(summary.topicBrief).toBe(chat.topicBrief);

  const tutor = await storedTutor(page);
  const opinions = tutor.topics.find((t) => t.name === "Opinions");
  expect(opinions.kind).toBe("opinions");
  expect(opinions.sessions).toBe(1);
  expect(tutor.memory.pt.sessions[0].topicId).toBe(opinions.id);
  expect(typeof tutor.memory.pt.sessions[0].themeId).toBe("string");
  expect(tutor.memory.pt.sessions[0].themeNote).toContain("Dev-stub theme note");

  // Next pick: progress on the row, and a different theme (every theme before a repeat).
  const row = page.locator("#tutor-topics .tutor-topic-opinions");
  await expect(row).toContainText("1 of 19 themes · 1 conversations");
  await page.locator("#tutor-topic-proposal").getByRole("button", { name: "No thanks" }).click();
  await row.click();
  const label2 = await page.locator("#tutor-lang-label").textContent();
  expect(label2.split(" · ").at(-1).trim()).not.toBe(theme);
  // The Opinions topic is the roller row only, never a second plain row.
  await page.click("#tutor-end");
  await expect(page.locator("#tutor-topics .tutor-topic-opinions")).toHaveCount(1);
  await expect(page.locator("#tutor-topics .tutor-topic", { hasText: "Opinions" })).toHaveCount(0);
});

test("a repeat theme carries Anna's previous note and says which time it is", async ({ page }) => {
  const bodies = [];
  page.on("request", (req) => {
    if (/\/tutor(Stream)?$/.test(req.url()) && req.method() === "POST") bodies.push(req.postDataJSON());
  });
  await startNewRun(page, { email: `beta-repeat-${Date.now()}@example.com` });
  await seedThemeSessions(page);
  await openTutor(page);

  const row = page.locator("#tutor-topics .tutor-topic-opinions");
  await expect(row).toContainText("19 of 19 themes · 37 conversations");
  await row.click();
  // Every other theme has two sessions; homework has one, so it is rolled.
  await expect(page.locator("#tutor-lang-label")).toContainText("Homework for children");
  await expect(page.locator(".tutor-msg.status", { hasText: "your 2nd time (last 2026-09-20)" })).toBeVisible();

  await page.fill("#tutor-input", "oi");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  const chat = bodies.find((b) => b.mode === "chat");
  expect(chat.topicBrief).toBe("Should children have homework? Why or why not?");
  expect(chat.topics).toContain("2nd conversation on it");
  expect(chat.topics).toContain("PREVIOUS CONVERSATIONS ON THIS THEME");
  expect(chat.topics).toContain("- 2026-09-20: Seeded note: argued for less homework.");
  expect(chat.topics).not.toContain("Seeded social_media");

  // The memory panel lists the themes with Anna's last note.
  await page.click("#tutor-memory-btn");
  const progress = page.locator("#tutor-theme-progress");
  await expect(progress).toContainText("Opinions themes in Portuguese: 19 of 19");
  await expect(progress).toContainText("Homework for children · 1 — Seeded note");
});
