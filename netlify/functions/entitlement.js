// Free tier (Nekh 2026-09-30): the first FREE_LESSONS lessons free behind
// an email account, paywall at the next one, Anna fully paywalled.
// FREE_LESSONS 3 -> 6 (Nekh 2026-10-08): lessons 5-6 are the first bundle
// of each chosen interest pack, so a trial reaches the learner's interests.
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

const FREE_LESSONS = 6;

// Where the website's MailerLite hand-off lives. `source: app-trial` routes
// to the trial group there (MAILERLITE_TRIAL_GROUP_ID on the site). Only an
// address with `email_opt_in_at` set is ever handed over (Austin via Nekh
// 2026-10-04): the sign-up form's box, or the one-time question after a
// first Google sign-in, both unticked by default. No backfill.
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

// The email-consent answer stored on an auth account by authProvision
// (user_metadata), as { askedAt, optInAt } ISO strings or nulls. A Google
// account carries none, so its learner is asked once in the app.
function consentFromMetadata(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const iso = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);
  return { askedAt: iso(m.email_opt_in_asked_at), optInAt: iso(m.email_opt_in_at) };
}

// First verified session for an email with no users row: create the
// free-tier row. `ignore-duplicates` means an existing row — any paying
// learner — is never touched, even in a race. `consent` ({ askedAt,
// optInAt }) is copied onto the row; the MailerLite hand-off runs only for
// a ticked box. Returns the row that now governs the account, and whether
// this call created it. If the consent columns are missing (migration not
// run) the row is created without them and the hand-off is skipped — no
// address reaches MailerLite without a stored consent.
async function provisionTrial(email, consent = null) {
  const key = usersKey();
  if (!key) throw new Error("no Supabase key for users");
  const base = { email, access_tier: "trial", trial_started_at: new Date().toISOString() };
  const withConsent = { ...base };
  if (consent && consent.askedAt) withConsent.email_opt_in_asked_at = consent.askedAt;
  if (consent && consent.optInAt) withConsent.email_opt_in_at = consent.optInAt;
  const insert = (row) => fetch(`${SUPABASE_URL}/rest/v1/users?on_conflict=email`, {
    method: "POST",
    headers: restHeaders(key, {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    }),
    body: JSON.stringify(row),
  });
  let consentStored = true;
  let res = await insert(withConsent);
  if (res.status === 400 && (withConsent.email_opt_in_asked_at || withConsent.email_opt_in_at)) {
    console.error("provisionTrial: email_opt_in columns missing — run migrations/email_opt_in.sql; consent not stored, no MailerLite hand-off");
    consentStored = false;
    res = await insert(base);
  }
  if (!res.ok) throw new Error(`trial insert returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  const created = Array.isArray(rows) && rows.length > 0;
  if (created) {
    await recordFunnelEvent("trial_start", email);
    if (consentStored && consent && consent.optInAt) await subscribeTrial(email);
    return { created, row: rows[0] };
  }
  return { created, row: null };
}

// The one-time answer from the in-app question (a first Google sign-in):
// stamps `email_opt_in_asked_at` now, and `email_opt_in_at` too when the
// box was ticked — only on a row that has no consent yet, so an earlier
// consent is never overwritten and the hand-off never runs twice. Returns
// { recorded, optedIn }.
async function recordEmailOptIn(email, optIn) {
  const key = usersKey();
  if (!key) throw new Error("no Supabase key for users");
  const now = new Date().toISOString();
  const patch = { email_opt_in_asked_at: now };
  if (optIn) patch.email_opt_in_at = now;
  const filter = `email=eq.${encodeURIComponent(email)}` + (optIn ? "&email_opt_in_at=is.null" : "");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?${filter}`, {
    method: "PATCH",
    headers: restHeaders(key, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`opt-in update returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  const recorded = Array.isArray(rows) && rows.length > 0;
  if (recorded && optIn) await subscribeTrial(email);
  return { recorded, optedIn: !!optIn };
}

// --- Anna's free month (pricing rebuild, Dan 2026-10-22) -------------------
// Every one-time purchase starts a free month of Anna (the website webhook
// stamps anna_trial_started_at / _ends_at and opens access_until to the
// trial end). Nothing is charged when it ends; the app reminds the learner
// with three sign-in popups, each shown once per account (the
// anna_popup_*_at stamps, set by trialEvent when one is shown):
//   welcome  first sign-in after the purchase (more than 5 days left)
//   5d       first sign-in with 5 days or fewer left
//   1d       first sign-in with 1 day or less left
// A later threshold supersedes an earlier one never shown (a learner who
// first signs in with 3 days left sees the 5-day popup, not a welcome).
// No popups once the learner subscribes, for a permanent window, or for
// rows that never had the free month (legacy subscribers, manual grants).

const DAY_MS = 24 * 60 * 60 * 1000;
const POPUP_COLUMNS = { welcome: "anna_popup_welcome_at", "5d": "anna_popup_5day_at", "1d": "anna_popup_1day_at" };
// The stamps a popup sets: its own and every earlier one, so a superseded
// popup never shows up later.
const POPUP_STAMPS = { welcome: ["welcome"], "5d": ["5d", "welcome"], "1d": ["1d", "5d", "welcome"] };

function windowEndMs(accessUntil) {
  if (!accessUntil || accessUntil === "infinity") return NaN;
  return Date.parse(accessUntil);
}

// What the app should know about Anna for this row at `now`:
// { accessUntil, subscribed, lockDate, popup, lapsed }. `subscribed` is a
// live Anna subscription (opted in, window still running); `lapsed` is a
// free month that ran out without one (the anna_lapse event).
function annaState(row, now = Date.now()) {
  const empty = { accessUntil: null, subscribed: false, lockDate: null, popup: null, lapsed: false };
  if (!row || isTrialRow(row)) return empty;
  const accessUntil = row.access_until || null;
  const permanent = accessUntil === "infinity";
  const end = windowEndMs(accessUntil);
  const live = permanent || (Number.isFinite(end) && end > now);
  const subscribed = !!row.anna_subscribed_at && live;
  const state = { ...empty, accessUntil, subscribed, lockDate: Number.isFinite(end) ? new Date(end).toISOString() : null };
  if (!row.anna_trial_started_at || permanent || subscribed) return state;
  if (!live) return { ...state, lapsed: true };
  const daysLeft = (end - now) / DAY_MS;
  if (daysLeft <= 1) {
    if (!row.anna_popup_1day_at) state.popup = "1d";
  } else if (daysLeft <= 5) {
    if (!row.anna_popup_5day_at && !row.anna_popup_1day_at) state.popup = "5d";
  } else if (!row.anna_popup_welcome_at && !row.anna_popup_5day_at && !row.anna_popup_1day_at) {
    state.popup = "welcome";
  }
  return state;
}

// Stamp the popup `threshold` (and the earlier ones it supersedes) on the
// learner's row. Each column is set only while NULL, so two devices racing
// stamp it once. Returns true when THIS call stamped the threshold's own
// column — the caller records anna_reminder_shown only then.
async function stampAnnaPopup(email, threshold) {
  const key = usersKey();
  if (!key) return false;
  const now = new Date().toISOString();
  let own = false;
  for (const t of POPUP_STAMPS[threshold] || []) {
    const col = POPUP_COLUMNS[t];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&${col}=is.null&select=email`, {
      method: "PATCH",
      headers: restHeaders(key, { "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({ [col]: now }),
    });
    if (!res.ok) throw new Error(`popup stamp ${col} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (t === threshold) own = Array.isArray(rows) && rows.length > 0;
  }
  return own;
}

// Whether this learner already has a funnel row of `eventType` (the
// once-per-account events with no stamp column of their own: anna_lapse).
async function hasFunnelEvent(eventType, email) {
  const key = usersKey();
  if (!key) return true;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/site_events?event_type=eq.${encodeURIComponent(eventType)}&session_id_hash=eq.${funnelId(email)}&select=id&limit=1`,
    { headers: restHeaders(key) },
  );
  if (!res.ok) return true; // unknown → don't risk a duplicate
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = {
  FREE_LESSONS,
  annaState,
  stampAnnaPopup,
  hasFunnelEvent,
  isTrialRow,
  tierOf,
  maxReleasedLessons,
  trialBlobViolation,
  funnelId,
  recordFunnelEvent,
  subscribeTrial,
  consentFromMetadata,
  provisionTrial,
  recordEmailOptIn,
};
