// Referral checkout (two-sided referral program, Dan 2026-10-09): a
// friend who opens a learner's referral link lands here. We validate
// the code against public.referral_codes, then create a Stripe
// Checkout Session with the first-payment coupon pre-applied, the
// referral code copied onto `client_reference_id` for the website's
// existing attribution webhook, and the same success_url the plain
// Stripe payment link uses. The friend is 302'd to the hosted session.
//
// A bad code (unknown, wrong format, or any lookup error) falls back
// silently to the plain $19 payment link, so the funnel never breaks.
//
// Env:
//   STRIPE_SECRET_KEY     restricted key with Checkout Sessions: write
//                         (the same key referralDiscountRun.js uses).
//                         Unset → fall back to the plain payment link.
//   SUPABASE_SECRET_KEY   bypasses RLS on referral_codes (no anon
//                         policy). Unset → fall back.
//   REFERRAL_PRICE_ID     Stripe Price id for the $19 subscription.
//                         Defaults to the current live price.
//   REFERRAL_COUPON_ID    Stripe Coupon id with duration=once,
//                         percent_off=20. Defaults to the one Gazi
//                         created for Dan's two-sided referral spec.

const { SUPABASE_URL, secretKey, restHeaders } = require("./supabase");

const STRIPE_API = "https://api.stripe.com/v1";
const PLAIN_PAYMENT_LINK = "https://buy.stripe.com/00w00i2G0ekMblW6WI9sk05";
const DEFAULT_PRICE_ID = "price_1UGNyCAxGblQBaSqJ2BEpTcA";
const DEFAULT_COUPON_ID = "referral_friend_20_off";
const SUCCESS_URL = "https://nekhslanguageblueprint.com/success?sku=app";
const CANCEL_URL = "https://nekhslanguageblueprint.com/zero-to-hero";

const CODE_PATTERN = /^ZTH-[A-Z0-9]{1,16}$/;

function redirect(location) {
  return { statusCode: 302, headers: { Location: location, "Cache-Control": "no-store" }, body: "" };
}

function fallback(code) {
  return redirect(code ? `${PLAIN_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(code)}` : PLAIN_PAYMENT_LINK);
}

async function codeExists(sbKey, code) {
  const url = `${SUPABASE_URL}/rest/v1/referral_codes?code=eq.${encodeURIComponent(code)}&select=code`;
  const res = await fetch(url, { headers: restHeaders(sbKey) });
  if (!res.ok) throw new Error(`referral_codes read ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function createSession(stripeSecret, code, { priceId, couponId }) {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("discounts[0][coupon]", couponId);
  form.set("client_reference_id", code);
  form.set("allow_promotion_codes", "false");
  form.set("consent_collection[terms_of_service]", "required");
  form.set("customer_creation", "if_required");
  form.set("payment_method_collection", "always");
  form.set("success_url", SUCCESS_URL);
  form.set("cancel_url", CANCEL_URL);
  form.set("metadata[sku]", "zth_app");
  form.set("metadata[referral_code]", code);
  form.set("metadata[source]", "referral_v2_two_sided");
  form.set("subscription_data[metadata][sku]", "zth_app");
  form.set("subscription_data[metadata][referral_code]", code);
  form.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "create_invoice");

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `referral-checkout-${code}-${Date.now()}`,
    },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe sessions ${res.status}: ${(data.error && data.error.message) || ""}`);
  if (!data.url) throw new Error("stripe sessions: missing url");
  return data.url;
}

exports.handler = async (event) => {
  const raw = (event.queryStringParameters && event.queryStringParameters.code) || "";
  const code = String(raw).trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return fallback(null);

  const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim();
  const sbKey = secretKey();
  if (!stripeSecret || !sbKey) {
    console.error("referralCheckout: STRIPE_SECRET_KEY or SUPABASE_SECRET_KEY unset — falling back to plain checkout");
    return fallback(code);
  }

  const priceId = (process.env.REFERRAL_PRICE_ID || "").trim() || DEFAULT_PRICE_ID;
  const couponId = (process.env.REFERRAL_COUPON_ID || "").trim() || DEFAULT_COUPON_ID;

  try {
    if (!(await codeExists(sbKey, code))) return fallback(code);
    const url = await createSession(stripeSecret, code, { priceId, couponId });
    return redirect(url);
  } catch (err) {
    console.error("referralCheckout error:", err && err.message);
    return fallback(code);
  }
};

exports.CODE_PATTERN = CODE_PATTERN;
exports.PLAIN_PAYMENT_LINK = PLAIN_PAYMENT_LINK;
exports.DEFAULT_COUPON_ID = DEFAULT_COUPON_ID;
exports.DEFAULT_PRICE_ID = DEFAULT_PRICE_ID;
