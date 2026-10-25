// Anna opt-in checkout (pricing rebuild, Dan 2026-10-22). Every app
// purchase comes with one free month of Anna and nothing is charged when it
// ends. A learner who wants to keep her opts in here: POST with the session
// token → { url } of a Stripe Checkout Session for the $19/month Anna
// subscription, which the app opens.
//
// When the first charge lands (directive point 4):
//   - Anna still on (free month, or referral months on top) → billing
//     starts the day she would have locked: the subscription's trial ends
//     at users.access_until. Stripe needs a trial end at least 48 hours
//     out; closer than that (the 1-day popup), the first billing date is
//     set with billing_cycle_anchor instead and nothing is prorated, so
//     the learner pays $0 today and $19 on that same day.
//   - Anna already locked → billed today.
// The card is collected now either way (payment_method_collection=always):
// opting in is the learner choosing to be charged from that date.
//
// The website's stripe-webhook stamps anna_subscribed_at on completion
// (sku zth_anna) and moves the Anna window on every invoice.paid.
//
// Refused: no session (401), a free-tier account (403, Anna comes with
// the app), Anna already permanent (409 permanent), a live subscription
// (409 subscribed).
//
// Env: STRIPE_SECRET_KEY (Checkout Sessions: write), SUPABASE_SECRET_KEY,
// ANNA_PRICE_ID (defaults to the live $19/month price, Dan 2026-10-25).

const { usersKey } = require("./supabase");
const { verifySession, unauthorizedResponse, fetchAccessRow, subscriptionActive } = require("./auth");
const { isTrialRow } = require("./entitlement");

const STRIPE_API = "https://api.stripe.com/v1";
const DEFAULT_ANNA_PRICE_ID = "price_1UUMgAAxGblQBaSqrOYFY5cG";
const APP_URL = "https://zerotoherolanguage.netlify.app/";
const HOUR_MS = 60 * 60 * 1000;
// Stripe refuses a Checkout trial_end closer than 48 hours; keep an hour
// of margin for the time the learner spends on the checkout page.
const MIN_TRIAL_MS = 49 * HOUR_MS;
// Closer than this to the lock, billing today is the honest answer.
const MIN_ANCHOR_MS = HOUR_MS;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// How the first charge is timed for a window ending at `accessUntil`
// (ISO string, 'infinity' or null). Pure, for the unit tests.
//   { kind: "trial", at }   trial_end = at (unix seconds)
//   { kind: "anchor", at }  billing_cycle_anchor = at, no proration
//   { kind: "now" }         billed today
function firstChargePlan(accessUntil, now = Date.now()) {
  const end = accessUntil && accessUntil !== "infinity" ? Date.parse(accessUntil) : NaN;
  if (!Number.isFinite(end)) return { kind: "now" };
  const left = end - now;
  const at = Math.floor(end / 1000);
  if (left >= MIN_TRIAL_MS) return { kind: "trial", at };
  if (left >= MIN_ANCHOR_MS) return { kind: "anchor", at };
  return { kind: "now" };
}

function sessionForm(email, priceId, plan) {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("customer_email", email);
  form.set("payment_method_collection", "always");
  form.set("allow_promotion_codes", "false");
  form.set("success_url", `${APP_URL}?anna=subscribed`);
  form.set("cancel_url", APP_URL);
  form.set("metadata[sku]", "zth_anna");
  form.set("subscription_data[metadata][sku]", "zth_anna");
  if (plan.kind === "trial") {
    form.set("subscription_data[trial_end]", String(plan.at));
  } else if (plan.kind === "anchor") {
    form.set("subscription_data[billing_cycle_anchor]", String(plan.at));
    form.set("subscription_data[proration_behavior]", "none");
  }
  return form;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const key = usersKey();
    const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim();
    if (!key || !stripeSecret) {
      console.error("annaCheckout: SUPABASE key or STRIPE_SECRET_KEY unset");
      return json(503, { error: "Checkout not configured" });
    }
    const row = await fetchAccessRow(session.email, key);
    if (!row || isTrialRow(row)) return json(403, { error: "Anna comes with the full app", code: "needs_app" });
    if (row.access_until === "infinity") return json(409, { error: "Anna is already yours", code: "permanent" });
    if (row.anna_subscribed_at && subscriptionActive(row.access_until)) {
      return json(409, { error: "You already subscribe to Anna", code: "subscribed" });
    }

    const priceId = (process.env.ANNA_PRICE_ID || "").trim() || DEFAULT_ANNA_PRICE_ID;
    const plan = firstChargePlan(row.access_until);
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sessionForm(session.email, priceId, plan).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      console.error("annaCheckout: stripe sessions", res.status, (data.error && data.error.message) || "");
      return json(502, { error: "Could not open checkout" });
    }
    return json(200, { url: data.url, firstCharge: plan.kind === "now" ? "today" : new Date(plan.at * 1000).toISOString() });
  } catch (err) {
    console.error("annaCheckout error:", err);
    return json(500, { error: "Server error" });
  }
};

exports.firstChargePlan = firstChargePlan;
exports.sessionForm = sessionForm;
exports.DEFAULT_ANNA_PRICE_ID = DEFAULT_ANNA_PRICE_ID;
