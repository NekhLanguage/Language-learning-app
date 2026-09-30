// Free tier (Nekh 2026-09-30): lessons 1-3 free behind an email account,
// paywall at lesson 4, Anna fully paywalled.
//
// Entitlement lives in the same place the Stripe webhook already writes:
// public.users. One column decides the tier (migrations/free_tier.sql):
//
//   access_tier = 'trial'  free account: lessons 1..FREE_LESSONS, no Anna.
//   access_tier = 'paid'   converted (Stripe webhook) or granted by hand.
//   access_tier IS NULL    every row that existed before the free tier —
//                          paying learners, Kenneth, manual grants. Treated
//                          exactly as before: full app, Anna by window.
//
// Upgrading is a tier change the website's stripe-webhook makes on
// checkout (trial -> paid, stamps converted_at + anna_month_free_at). The
// client learns the tier from checkAccess but never decides anything that
// costs money: Anna is refused here and in tutor.js, and saveUser refuses a
// trial blob that has moved past lesson FREE_LESSONS.

const { createHash } = require("crypto");
const { SUPABASE_URL, usersKey, restHeaders } = require("./supabase");

const FREE_LESSONS = 3;

// Where the website's MailerLite hand-off lives. `source: app-trial` routes
// to the trial group there (MAILERLITE_TRIAL_GROUP_ID on the site).
const SUBSCRIBE_URL = process.env.SITE_SUBSCRIBE_URL || "https://nekhslanguageblueprint.com/api/subscribe";

function isTrialRow(row) {
  return !!row && row.access_tier === "trial";
}

function tierOf(row) {
  if (!row) return null;
  return isTrialRow(row) ? "trial" : "paid";
}

// Lessons a blob has released in its most-advanced run. A lesson is a
// release-plan bundle; one is released at run start and one per finished
// session, so this is also "the lesson the learner is on".
function maxReleasedLessons(user) {
  const runs = (user && typeof user === "object" && user.runs && typeof user.runs === "object") ? user.runs : {};
  let max = 0;
  for (const run of Object.values(runs)) {
    const ids = run && Array.isArray(run.releasedBundleIds) ? run.releasedBundleIds : [];
    if (ids.length > max) max = ids.length;
  }
  return max;
}

// Server-side progression gate: a trial account may never store a run that
// has released past the free lessons. Returns null when the blob is fine.
function trialBlobViolation(user) {
  const lessons = maxReleasedLessons(user);
  if (lessons > FREE_LESSONS) {
    return { code: "paywall", lessons, freeLessons: FREE_LESSONS };
  }
  return null;
}

// Stable, non-reversible id for the site_events.session_id_hash column so a
// trial's funnel rows join up without storing the email there.
function funnelId(email) {
  return createHash("sha256")
    .update(`zth-trial:${String(email || "").toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32);
}

// One funnel row in public.site_events. Fail-soft: analytics never blocks
// a learner. Written with the secret key (no anon policy needed).
async function recordFunnelEvent(eventType, email, props = null) {
  const key = usersKey();
  if (!key) return false;
  try {
    const row = {
      event_type: eventType,
      path: "/app",
      session_id_hash: funnelId(email),
    };
    if (props && typeof props === "object") row.props = props;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
      method: "POST",
      headers: restHeaders(key, { "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      console.error(`funnel event ${eventType} insert failed:`, res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`funnel event ${eventType} error:`, err && err.message);
    return false;
  }
}

// Hand the new free-tier learner to MailerLite through the website's
// subscribe endpoint, the same way the site forms do (source names the
// form; the site maps it to a group). Fail-soft: a missing group id on the
// site is logged there and here, never a blocked signup.
async function subscribeTrial(email) {
  try {
    const res = await fetch(SUBSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "app-trial", session_id_hash: funnelId(email) }),
    });
    if (!res.ok) {
      console.error("subscribeTrial: site subscribe returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("subscribeTrial error:", err && err.message);
    return false;
  }
}

// First verified session for an email with no users row: create the
// free-tier row. `ignore-duplicates` means an existing row — any paying
// learner — is never touched, even in a race. Returns the row that now
// governs the account, and whether this call created it.
async function provisionTrial(email) {
  const key = usersKey();
  if (!key) throw new Error("no Supabase key for users");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=email`, {
    method: "POST",
    headers: restHeaders(key, {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    }),
    body: JSON.stringify({
      email,
      access_tier: "trial",
      trial_started_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`trial insert returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  const created = Array.isArray(rows) && rows.length > 0;
  if (created) {
    await recordFunnelEvent("trial_start", email);
    await subscribeTrial(email);
    return { created, row: rows[0] };
  }
  return { created, row: null };
}

module.exports = {
  FREE_LESSONS,
  isTrialRow,
  tierOf,
  maxReleasedLessons,
  trialBlobViolation,
  funnelId,
  recordFunnelEvent,
  subscribeTrial,
  provisionTrial,
};
