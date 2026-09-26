// Anna reliability + synced settings (Nekh 2026-09-13): a message that
// cannot be delivered is never lost or retyped, a session whose notes
// cannot be written is still saved, an unfinished conversation survives a
// reload, and Anna's instructions live in the synced USER record so a new
// patch or device keeps them.

import { test, expect, startNewRun } from "./fixtures.mjs";

// The dev-server stub returns 502 for injected failures; the fixture's
// error detector records those responses (and the browser's own console
// line for each). The client's console.warn lines are not errors. Drop
// only the injected 502s.
function dropInjected(pageErrors) {
  for (let i = pageErrors.length - 1; i >= 0; i--) {
    const e = pageErrors[i];
    if (/^http 502: .*\/tutor(Stream)?$/.test(e) || /^console: Failed to load resource: .*502/.test(e)) {
      pageErrors.splice(i, 1);
    }
  }
}

async function openTutor(page) {
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
}

test("a transient failure is retried without the learner noticing", async ({ page, pageErrors }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "hei __FAIL_ONCE__");
  await page.click("#tutor-send");
  // First attempt 502s, the automatic retry (1 s later) succeeds.
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".tutor-msg.assistant")).toContainText("hei __FAIL_ONCE__");
  await expect(page.locator(".tutor-msg.user.undelivered")).toHaveCount(0);
  await expect(page.locator("#tutor-input")).toHaveValue("");
  dropInjected(pageErrors);
});

test("an undelivered message keeps its text in the input and can be retried", async ({ page, pageErrors }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "hei __FAIL_ALWAYS__");
  await page.click("#tutor-send");
  // Three attempts (≈3 s of backoff) then the bubble is marked undelivered.
  const failed = page.locator(".tutor-msg.user.undelivered");
  await expect(failed).toHaveCount(1, { timeout: 20_000 });
  await expect(failed).toContainText("Not delivered");
  // Nothing to retype: the text is still in the input and in the draft.
  await expect(page.locator("#tutor-input")).toHaveValue("hei __FAIL_ALWAYS__");
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_tutor_draft_pt") || "null"));
  expect(draft?.text).toBe("hei __FAIL_ALWAYS__");

  // Edit the message so the stub accepts it, then Retry — the same bubble
  // is delivered, no duplicate bubble appears.
  await page.fill("#tutor-input", "hei igjen");
  await page.locator(".tutor-retry").click();
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".tutor-msg.user")).toHaveCount(1);
  await expect(page.locator(".tutor-msg.user")).toHaveText("hei igjen");
  await expect(page.locator(".tutor-msg.user.undelivered")).toHaveCount(0);
  await expect(page.locator("#tutor-input")).toHaveValue("");
  dropInjected(pageErrors);
});

test("an unfinished conversation and a typed draft survive a reload", async ({ page }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "hello");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1);
  await page.fill("#tutor-input", "half-typed thought");

  await page.reload();
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator(".tutor-msg.user")).toHaveText("hello");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1);
  await expect(page.locator(".tutor-msg.status", { hasText: "unfinished conversation" })).toBeVisible();
  await expect(page.locator("#tutor-input")).toHaveValue("half-typed thought");
});

test("End session still saves when Anna's notes cannot be written, and finishes them later", async ({ page, pageErrors }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "hello __SUMMARY_FAIL__");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1);

  await page.click("#tutor-end");
  await expect(page.locator(".tutor-msg.status", { hasText: "Session saved. Anna couldn't write her notes" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".tutor-msg.user")).toHaveCount(0);

  // Saved into the synced USER record with the transcript kept for retry.
  const mem = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).tutor.memory.pt);
  expect(mem.sessions).toHaveLength(1);
  expect(mem.sessions[0].pending.messages.length).toBe(2);
  expect(mem.sessions[0].pending.attempts).toBe(0);

  // Remove the marker so the retry succeeds, then reopen the tutor: the
  // record is completed in the background.
  await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    for (const m of u.tutor.memory.pt.sessions[0].pending.messages) m.content = m.content.replace("__SUMMARY_FAIL__", "");
    u.lastLocalChange = Date.now();
    u.tutor = u.tutor || {};
    u.tutor.updatedAt = Date.now();
    localStorage.setItem("zth_user", JSON.stringify(u));
  });
  await page.reload();
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator(".tutor-msg.status", { hasText: "Anna finished her notes" })).toBeVisible({ timeout: 15_000 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).tutor.memory.pt.sessions[0]);
  expect(after.pending).toBeUndefined();
  expect(after.sessionSummary).toBe("Dev-stub session: practiced greetings.");
  expect(after.nextFocus).toBe("Keep practicing verb endings.");
  dropInjected(pageErrors);
});

test("Anna's instructions are saved to the synced USER record and sent on every request", async ({ page }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.selectOption("#pref-challenge", "push");
  await page.fill("#tutor-note", "Push me hard on verb endings.");
  await expect(page.locator("#tutor-note-count")).toHaveText("29/1000");
  await page.click("#tutor-settings-save");

  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).tutor.prefs.pt);
  expect(prefs.challenge).toBe("push");
  expect(prefs.note).toBe("Push me hard on verb endings.");

  const chatReq = page.waitForRequest((req) => {
    if (req.method() !== "POST" || !req.url().includes("/.netlify/functions/tutor")) return false;
    try { return JSON.parse(req.postData() || "{}").mode === "chat"; } catch { return false; }
  });
  await page.fill("#tutor-input", "hello");
  await page.click("#tutor-send");
  const body = JSON.parse((await chatReq).postData() || "{}");
  expect(body.preferences.challenge).toBe("push");
  expect(body.preferences.note).toBe("Push me hard on verb endings.");

  // Simulate a new patch / new device: the synced record is the only thing
  // that survives, and it is enough — no setup panel, dials restored.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("zth_tutor_")) localStorage.removeItem(k);
  });
  await page.reload();
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator("#tutor-settings")).toBeHidden();
  await page.click("#tutor-settings-btn");
  await expect(page.locator("#pref-challenge")).toHaveValue("push");
  await expect(page.locator("#tutor-note")).toHaveValue("Push me hard on verb endings.");
});

test("pre-v4 device-local prefs and sessions migrate into the synced record", async ({ page }) => {
  await startNewRun(page);
  await page.evaluate(() => {
    localStorage.setItem("zth_tutor_prefs_pt", JSON.stringify({ correctionDepth: "light", challenge: "comfort", languageMix: "support", note: "legacy note" }));
    localStorage.setItem("zth_tutor_pt", JSON.stringify({ sessions: [{ when: "2026-09-01", sessionSummary: "Old device session.", struggles: [], nextFocus: "Numbers." }], personalVocab: [] }));
  });
  await openTutor(page);
  // Prefs exist → no setup panel; the legacy next focus shows.
  await expect(page.locator("#tutor-settings")).toBeHidden();
  await expect(page.locator(".tutor-msg.status", { hasText: "Last time's focus: Numbers." })).toBeVisible();
  const tutor = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).tutor);
  expect(tutor.prefs.pt.challenge).toBe("comfort");
  expect(tutor.prefs.pt.note).toBe("legacy note");
  expect(tutor.memory.pt.sessions[0].sessionSummary).toBe("Old device session.");
});

test("first visit shows who Anna is, in the learner's support language", async ({ page }) => {
  await startNewRun(page);
  await openTutor(page);
  // Setup mode (no saved prefs yet) carries the intro, in English by default…
  await expect(page.locator("#tutor-intro")).toBeVisible();
  await expect(page.locator("#tutor-intro")).toContainText("Anna is your personal tutor");
  await page.click("#tutor-settings-save");
  // …and the ⚙️ settings panel later does not repeat it.
  await page.click("#tutor-settings-btn");
  await expect(page.locator("#tutor-intro")).toBeHidden();
  await page.click("#tutor-settings-close");

  // A fresh learner whose support language is Portuguese gets the
  // Portuguese text. (Sign the first learner out first: the sign-in
  // screen only appears without a session.)
  await page.evaluate(() => localStorage.clear());
  await startNewRun(page);
  await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    u.supportLanguage = "pt";
    u.lastLocalChange = Date.now();
    u.tutor = u.tutor || {};
    u.tutor.updatedAt = Date.now();
    localStorage.setItem("zth_user", JSON.stringify(u));
  });
  await openTutor(page);
  await expect(page.locator("#tutor-intro")).toBeVisible();
  await expect(page.locator("#tutor-intro")).toContainText("A Anna é sua tutora pessoal");
});

test("Anna's reply streams in through the streaming endpoint, with a typing indicator first", async ({ page }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "olá streaming");
  const streamed = page.waitForResponse((r) => r.url().includes("/.netlify/functions/tutorStream") && r.status() === 200);
  await page.click("#tutor-send");
  await streamed;
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".tutor-msg.assistant")).toHaveText(/You said: olá streaming$/);
  await expect(page.locator(".tutor-msg.assistant.streaming")).toHaveCount(0);
  await expect(page.locator(".tutor-msg.status.typing")).toHaveCount(0);
  await expect(page.locator("#tutor-input")).toHaveValue("");
});

test("a reply cut off mid-stream is treated as undelivered, not shown half-finished", async ({ page, pageErrors }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "hei __STREAM_CUT__");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.user.undelivered")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(0);
  await expect(page.locator("#tutor-input")).toHaveValue("hei __STREAM_CUT__");
  pageErrors.length = 0;
});

test("End session hands the screen back at once and Anna's notes arrive afterwards", async ({ page }) => {
  await startNewRun(page);
  await openTutor(page);
  await page.click("#tutor-settings-save");

  await page.fill("#tutor-input", "olá");
  await page.click("#tutor-send");
  await expect(page.locator(".tutor-msg.assistant")).toHaveCount(1, { timeout: 15_000 });

  await page.click("#tutor-end");
  // Saved and usable before the (stub-delayed) notes come back.
  await expect(page.locator(".tutor-msg.status", { hasText: "Session saved. Anna is writing her notes" })).toBeVisible({ timeout: 2_000 });
  await expect(page.locator("#tutor-input")).toBeEnabled();
  await expect(page.locator(".tutor-msg.user")).toHaveCount(0);
  // Then the notes land in place.
  await expect(page.locator(".tutor-msg.status", { hasText: "Your tutor will remember this next time" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".tutor-msg.status", { hasText: "Next focus:" })).toBeVisible();
  const mem = await page.evaluate(() => JSON.parse(localStorage.getItem("zth_user")).tutor.memory.pt);
  expect(mem.sessions).toHaveLength(1);
  expect(mem.sessions[0].pending).toBeUndefined();
  expect(mem.sessions[0].nextFocus).toBe("Keep practicing verb endings.");
});
