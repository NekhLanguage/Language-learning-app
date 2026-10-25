// Anna's free month (pricing rebuild, Dan 2026-10-22): three sign-in
// popups — welcome, 5 days left, 1 day left — each once per account. The
// dev server holds the account's Anna timeline (POST /__devserver/anna)
// and answers checkAccess with the real entitlement.js annaState, so these
// tests time-travel by moving access_until. Every popup must sit fully on
// screen at phone size: its buttons are never below the fold (Nekh
// 2026-10-25).

import { test, expect, loginAs } from "./fixtures.mjs";

const DAY = 86400000;
const uniq = () => Math.random().toString(36).slice(2);
const iso = (ms) => new Date(ms).toISOString();

async function setAnna(request, email, daysLeft, extra = {}) {
  const prev = await (await request.get(`/__devserver/anna?email=${encodeURIComponent(email)}`)).json();
  const keep = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith("anna_popup_")));
  await request.post(`/__devserver/anna?email=${encodeURIComponent(email)}`, {
    data: {
      access_until: iso(Date.now() + daysLeft * DAY),
      anna_trial_started_at: iso(Date.now() - (30 - daysLeft) * DAY),
      anna_trial_ends_at: iso(Date.now() + daysLeft * DAY),
      ...keep,
      ...extra,
    },
  });
}

async function shownEvents(request, email) {
  const events = await (await request.get("/__devserver/events")).json();
  return events.filter((e) => e.email === email && e.event_type === "anna_reminder_shown").map((e) => e.props.threshold);
}

// Everything in the popup a learner needs is inside the viewport.
async function expectFullyOnScreen(page) {
  const vp = page.viewportSize();
  for (const sel of ["#anna-popup-title", "#anna-popup-primary"]) {
    const box = await page.locator(sel).boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height);
  }
  const secondary = page.locator("#anna-popup-secondary");
  if (await secondary.isVisible()) {
    const box = await secondary.boundingBox();
    expect(box.y + box.height, "secondary bottom").toBeLessThanOrEqual(vp.height);
  }
}

async function reboot(page) {
  await page.reload();
  await expect(page.locator("#start-screen.active")).toBeVisible({ timeout: 10_000 });
}

test.use({ viewport: { width: 360, height: 640 } });

test("welcome, then 5 days left, then 1 day left: each once, each fully on screen", async ({ page, request }) => {
  const email = `buyer-${uniq()}@example.com`;
  await setAnna(request, email, 30);
  await loginAs(page, email);

  const popup = page.locator("#anna-popup");
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#anna-popup-title")).toHaveText("The app is yours");
  await expect(page.locator("#anna-popup-body")).toContainText("No card for Anna, no auto-charge.");
  await expect(page.locator("#anna-popup-secondary")).toBeHidden();
  await expectFullyOnScreen(page);
  await page.click("#anna-popup-primary");
  await expect(popup).toBeHidden();

  await reboot(page);
  await page.waitForLoadState("networkidle");
  await expect(popup).toBeHidden();

  await setAnna(request, email, 4.5);
  await reboot(page);
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#anna-popup-title")).toHaveText("Anna's free month ends in 5 days");
  // {date} is the lock day in the learner's locale, short form.
  await expect(page.locator("#anna-popup-body")).not.toContainText("{date}");
  await expectFullyOnScreen(page);
  await page.click("#anna-popup-secondary");
  await expect(popup).toBeHidden();

  await reboot(page);
  await page.waitForLoadState("networkidle");
  await expect(popup).toBeHidden();

  await setAnna(request, email, 0.5);
  await reboot(page);
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#anna-popup-title")).toHaveText("Anna's free month ends tomorrow");
  await expectFullyOnScreen(page);
  await page.click("#anna-popup-secondary");

  await reboot(page);
  await page.waitForLoadState("networkidle");
  await expect(popup).toBeHidden();

  await expect.poll(() => shownEvents(request, email)).toEqual(["welcome", "5d", "1d"]);
});

test("first sign-in with 3 days left: the 5-day popup, never a late welcome; Keep Anna opens checkout", async ({ page, request }) => {
  const email = `late-${uniq()}@example.com`;
  await setAnna(request, email, 3);
  await loginAs(page, email);
  await expect(page.locator("#anna-popup-title")).toHaveText("Anna's free month ends in 5 days", { timeout: 10_000 });
  await expectFullyOnScreen(page);
  await Promise.all([page.waitForURL(/anna=checkout-stub/), page.click("#anna-popup-primary")]);
  await expect.poll(() => shownEvents(request, email)).toEqual(["5d"]);
});

test("no popups for a subscriber, who gets the Manage subscription link", async ({ page, request }) => {
  const sub = `sub-${uniq()}@example.com`;
  await setAnna(request, sub, 3, { anna_subscribed_at: iso(Date.now() - DAY) });
  await loginAs(page, sub);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#anna-popup")).toBeHidden();
  // A live Anna subscription is the one thing the portal link is for.
  await expect(page.locator("#link-manage-subscription")).toBeVisible();
});

test("a lapsed free month shows no popup and records anna_lapse once", async ({ page, request }) => {
  const lapsed = `lapsed-${uniq()}@example.com`;
  await setAnna(request, lapsed, -2);
  await loginAs(page, lapsed);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#anna-popup")).toBeHidden();
  await expect(page.locator("#link-manage-subscription")).toBeHidden();
  await reboot(page);
  await page.waitForLoadState("networkidle");
  const events = await (await request.get("/__devserver/events")).json();
  expect(events.filter((e) => e.email === lapsed && e.event_type === "anna_lapse")).toHaveLength(1);
});
