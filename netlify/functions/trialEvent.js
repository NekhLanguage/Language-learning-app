// Free-tier funnel events the browser sees first (Nekh 2026-09-30).
// POST { type, lesson? } with the learner's session token.
//
//   trial_lesson_complete  { lesson: 1..3 }  a free lesson (session) finished
//   paywall_hit            {}                the lesson-4 paywall was shown
//   trial_anna_intro_seen  {}                the end-of-lesson-3 Anna screen
//
// Pricing-rebuild events (Dan 2026-10-22, PR A of the pricing rebuild):
//
//   anna_reminder_shown    { threshold }     a popup fired on sign-in;
//                                             threshold is 'welcome' | '5d' | '1d'.
//                                             Stamps the row's anna_popup_*_at
//                                             (entitlement.js stampAnnaPopup)
//                                             and is recorded only by the call
//                                             that stamped it: once per account.
//   anna_lapse             {}                the free month ended and the
//                                             learner never subscribed. Checked
//                                             against the row (annaState) and
//                                             recorded once per account.
//
// anna_trial_start and anna_subscribe stay accepted here for older clients
// but the app no longer sends them: the website's Stripe webhook writes both
// where they actually happen (purchase / Anna checkout completed).
//
// trial_start (checkAccess) and trial_convert (the website's Stripe
// webhook) are written server-side where they happen, never from here.
// Rows land in public.site_events next to the marketing site's funnel.
// A learner on any tier (trial or paid) can fire the Anna-trial events —
// the free month ships with every purchase, so paid rows need them too.
// The free-tier events stay trial-only.

const { usersKey } = require("./supabase");
const { verifySession, fetchAccessRow } = require("./auth");
const { FREE_LESSONS, isTrialRow, recordFunnelEvent, annaState, stampAnnaPopup, hasFunnelEvent } = require("./entitlement");

const TRIAL_ONLY_EVENTS = new Set(["trial_lesson_complete", "paywall_hit", "trial_anna_intro_seen"]);
const ANNA_EVENTS = new Set(["anna_trial_start", "anna_reminder_shown", "anna_subscribe", "anna_lapse"]);
const CLIENT_EVENTS = new Set([...TRIAL_ONLY_EVENTS, ...ANNA_EVENTS]);
const REMINDER_THRESHOLDS = new Set(["welcome", "5d", "1d"]);

const NO_CONTENT = { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  try {
    const body = JSON.parse(event.body || "{}");
    const type = String(body.type || "");
    if (!CLIENT_EVENTS.has(type)) return { statusCode: 400, body: JSON.stringify({ error: "Unknown event" }) };

    const session = await verifySession(event);
    if (!session) return NO_CONTENT;
    const key = usersKey();
    if (!key) return NO_CONTENT;
    const row = await fetchAccessRow(session.email, key);
    if (!row) return NO_CONTENT;
    if (TRIAL_ONLY_EVENTS.has(type) && !isTrialRow(row)) return NO_CONTENT;

    let props = null;
    if (type === "trial_lesson_complete") {
      const lesson = Number(body.lesson);
      if (!Number.isInteger(lesson) || lesson < 1 || lesson > FREE_LESSONS) {
        return { statusCode: 400, body: JSON.stringify({ error: "Bad lesson index" }) };
      }
      props = { lesson };
    }
    if (type === "anna_reminder_shown") {
      const threshold = String(body.threshold || "");
      if (!REMINDER_THRESHOLDS.has(threshold)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Bad reminder threshold" }) };
      }
      props = { threshold };
      if (annaState(row).popup !== threshold) return NO_CONTENT;
      if (!(await stampAnnaPopup(session.email, threshold))) return NO_CONTENT;
    }
    if (type === "anna_lapse") {
      if (!annaState(row).lapsed) return NO_CONTENT;
      if (await hasFunnelEvent("anna_lapse", session.email)) return NO_CONTENT;
    }
    if (typeof body.lang === "string" && body.lang) {
      props = { ...(props || {}), lang: body.lang.slice(0, 10) };
    }
    await recordFunnelEvent(type, session.email, props);
    return NO_CONTENT;
  } catch (err) {
    console.error("trialEvent error:", err);
    return NO_CONTENT;
  }
};
