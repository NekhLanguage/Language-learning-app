// Two devices, one learner (Nekh 2026-09-26): a topic made with Anna on
// the computer must survive a lesson done on the phone afterwards, and
// must show up when Anna is opened directly on a device that hasn't
// booted the app since. The "phone" is simulated by rewriting this
// browser's stored copy the way an older device's app would have left it.

import { test, expect, startNewRun } from "./fixtures.mjs";

async function makeTopicWithAnna(page, name) {
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await page.click("#tutor-settings-save");
  const picker = page.locator("#tutor-topics");
  await expect(picker).toBeVisible();
  await picker.locator("input").fill(name);
  await picker.locator("button[type=submit]").click();
  await expect(page.locator("#tutor-lang-label")).toContainText(name);
}

const serverTopics = async (page, email) => {
  const res = await page.request.get("/__devserver/users");
  const users = await res.json();
  return (users[email]?.tutor?.topics || []).map((t) => t.name);
};

test("a lesson on a second device after a topic session does not erase the topic", async ({ page }) => {
  const email = await startNewRun(page, { email: `beta-sync-${Date.now()}@example.com` });
  await makeTopicWithAnna(page, "Rave Master");
  await expect.poll(() => serverTopics(page, email)).toEqual(["Rave Master"]);

  // The phone: same account, a copy saved BEFORE the topic session, then a
  // lesson on it AFTER (newer lastLocalChange, no topic, no tutor stamp).
  await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    u.tutor = { prefs: {}, memory: {} };
    u.runs.pt.released.push("PHONE_LESSON_MARKER");
    u.lastLocalChange = Date.now() + 5_000;
    localStorage.setItem("zth_user", JSON.stringify(u));
  });
  await page.goto("/");
  await expect(page.locator("#start-screen.active")).toBeVisible();
  // The phone's run progress is kept (it was newer) AND Anna's topic is
  // back — on the device and on the server.
  await expect.poll(async () => page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    return { topics: (u.tutor?.topics || []).map((t) => t.name), marker: u.runs.pt.released.includes("PHONE_LESSON_MARKER") };
  })).toEqual({ topics: ["Rave Master"], marker: true });
  await expect.poll(() => serverTopics(page, email)).toEqual(["Rave Master"]);
});

test("Anna opened directly on a device that never booted the app shows the topic", async ({ page }) => {
  const email = await startNewRun(page, { email: `beta-sync-direct-${Date.now()}@example.com` });
  await makeTopicWithAnna(page, "Cooking");
  await expect.poll(() => serverTopics(page, email)).toEqual(["Cooking"]);

  // A device whose copy predates the topic session, opening tutor.html
  // straight away (no app boot in between).
  await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem("zth_user"));
    u.tutor = { prefs: {}, memory: {} };
    u.lastLocalChange = 1;
    localStorage.setItem("zth_user", JSON.stringify(u));
  });
  await page.goto("/tutor.html");
  await expect(page.locator("#tutor-main")).toBeVisible();
  await expect(page.locator("#tutor-topics .tutor-topic")).toHaveText(["Cooking"]);
});
