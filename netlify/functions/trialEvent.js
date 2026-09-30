// Free-tier funnel events the browser sees first (Nekh 2026-09-30).
// POST { type, lesson? } with the learner's session token.
//
//   trial_lesson_complete  { lesson: 1..3 }  a free lesson (session) finished
//   paywall_hit            {}                the lesson-4 paywall was shown
//   trial_anna_intro_seen  {}                the end-of-lesson-3 Anna screen
//
// trial_start (checkAccess) and trial_convert (the website's Stripe
// webhook) are written server-side where they happen, never from here.
// Rows land in public.site_events next to the marketing site's funnel.
// Only a free-tier account's events are recorded; everything else is a
// quiet 204 so the client never has to care.

const { usersKey } = require("./supabase");
const { verifySession, fetchAccessRow } = require("./auth");
const { FREE_LESSONS, isTrialRow, recordFunnelEvent } = require("./entitlement");

const CLIENT_EVENTS = new Set(["trial_lesson_complete", "paywall_hit", "trial_anna_intro_seen"]);

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
    if (!isTrialRow(row)) return NO_CONTENT;

    let props = null;
    if (type === "trial_lesson_complete") {
      const lesson = Number(body.lesson);
      if (!Number.isInteger(lesson) || lesson < 1 || lesson > FREE_LESSONS) {
        return { statusCode: 400, body: JSON.stringify({ error: "Bad lesson index" }) };
      }
      props = { lesson };
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
