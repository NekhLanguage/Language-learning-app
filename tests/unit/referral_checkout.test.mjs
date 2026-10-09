// Referral checkout (Dan 2026-10-09): the friend hits /r/<CODE>, the
// function validates the code against Supabase and 302s on to a Stripe
// Checkout Session with the 20%-off-first-payment coupon pre-applied.
// Any failure (bad code, Stripe error, missing env) falls back to the
// plain $19 payment link so the funnel never breaks.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const checkout = require("../../netlify/functions/referralCheckout.js");

const STRIPE_URL = "https://checkout.stripe.com/c/pay/cs_live_test";

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

async function withFetch(fetchImpl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

function fakeFetch({ existingCodes = ["ZTH-ALICESMI"], stripeOk = true, stripeStatus = 200, stripeBody = { url: STRIPE_URL } } = {}) {
  const calls = { supabase: [], stripe: [] };
  const impl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/rest/v1/referral_codes")) {
      calls.supabase.push({ url: u, init });
      const code = decodeURIComponent((/code=eq\.([^&]+)/.exec(u) || [])[1] || "");
      return new Response(JSON.stringify(existingCodes.includes(code) ? [{ code }] : []), { status: 200 });
    }
    if (u.includes("api.stripe.com") && u.endsWith("/checkout/sessions")) {
      calls.stripe.push({ url: u, body: init.body, headers: init.headers });
      return new Response(JSON.stringify(stripeOk ? stripeBody : { error: { message: "test error" } }), { status: stripeStatus });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { impl, calls };
}

const ENV = { STRIPE_SECRET_KEY: "sk_live_test", SUPABASE_SECRET_KEY: "sb_secret_test" };
const event = (code) => ({ queryStringParameters: code === undefined ? null : { code } });

test("CODE_PATTERN accepts ZTH-<alphanumeric> up to 16 chars, rejects anything else", () => {
  assert.ok(checkout.CODE_PATTERN.test("ZTH-ALICESMI"));
  assert.ok(checkout.CODE_PATTERN.test("ZTH-A"));
  assert.ok(checkout.CODE_PATTERN.test("ZTH-ALICESMI01"));
  assert.ok(!checkout.CODE_PATTERN.test("ALICESMI"));
  assert.ok(!checkout.CODE_PATTERN.test("ZTH-"));
  assert.ok(!checkout.CODE_PATTERN.test("ZTH-alice'; DROP TABLE users;"));
  assert.ok(!checkout.CODE_PATTERN.test("ZTH-" + "A".repeat(17)));
});

test("bad or missing code: 302 to the plain payment link with no referrer attached", async () => {
  for (const bad of [undefined, "", "not-a-code", "ZTH-", "ZTH-' OR 1=1"]) {
    const { impl } = fakeFetch();
    await withEnv(ENV, () => withFetch(impl, async () => {
      const res = await checkout.handler(event(bad));
      assert.equal(res.statusCode, 302);
      assert.equal(res.headers.Location, checkout.PLAIN_PAYMENT_LINK);
    }));
  }
});

test("missing STRIPE_SECRET_KEY: fallback to the plain link, with the code as client_reference_id", async () => {
  const { impl } = fakeFetch();
  await withEnv({ STRIPE_SECRET_KEY: undefined, SUPABASE_SECRET_KEY: "sb" }, () => withFetch(impl, async () => {
    const res = await checkout.handler(event("ZTH-ALICESMI"));
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.Location, /^https:\/\/buy\.stripe\.com\/.+\?client_reference_id=ZTH-ALICESMI$/);
  }));
});

test("code not found in Supabase: fallback with the code, no Stripe call", async () => {
  const { impl, calls } = fakeFetch({ existingCodes: [] });
  await withEnv(ENV, () => withFetch(impl, async () => {
    const res = await checkout.handler(event("ZTH-UNKNOWN"));
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.Location, /client_reference_id=ZTH-UNKNOWN$/);
    assert.equal(calls.stripe.length, 0);
  }));
});

test("valid code: creates a Checkout Session with the coupon pre-applied and 302s to session.url", async () => {
  const { impl, calls } = fakeFetch();
  await withEnv(ENV, () => withFetch(impl, async () => {
    const res = await checkout.handler(event("ZTH-ALICESMI"));
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, STRIPE_URL);
    assert.equal(calls.stripe.length, 1);
    const body = String(calls.stripe[0].body);
    assert.ok(body.includes("mode=subscription"));
    assert.ok(body.includes(`line_items%5B0%5D%5Bprice%5D=${encodeURIComponent(checkout.DEFAULT_PRICE_ID)}`));
    assert.ok(body.includes(`discounts%5B0%5D%5Bcoupon%5D=${encodeURIComponent(checkout.DEFAULT_COUPON_ID)}`));
    assert.ok(body.includes("client_reference_id=ZTH-ALICESMI"));
    assert.ok(body.includes("allow_promotion_codes=false"));
    assert.ok(body.includes("metadata%5Breferral_code%5D=ZTH-ALICESMI"));
  }));
});

test("code is lower-cased on the wire: uppercased before lookup and attribution", async () => {
  const { impl, calls } = fakeFetch({ existingCodes: ["ZTH-ALICESMI"] });
  await withEnv(ENV, () => withFetch(impl, async () => {
    const res = await checkout.handler(event("zth-alicesmi"));
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, STRIPE_URL);
    const sbUrl = calls.supabase[0].url;
    assert.ok(sbUrl.includes("code=eq.ZTH-ALICESMI"), sbUrl);
  }));
});

test("Stripe 4xx: fallback to the plain link with the code attached", async () => {
  const { impl, calls } = fakeFetch({ stripeOk: false, stripeStatus: 400 });
  await withEnv(ENV, () => withFetch(impl, async () => {
    const res = await checkout.handler(event("ZTH-ALICESMI"));
    assert.equal(res.statusCode, 302);
    assert.match(res.headers.Location, /client_reference_id=ZTH-ALICESMI$/);
    assert.equal(calls.stripe.length, 1);
  }));
});

test("env override: REFERRAL_PRICE_ID / REFERRAL_COUPON_ID replace the defaults", async () => {
  const { impl, calls } = fakeFetch();
  await withEnv({ ...ENV, REFERRAL_PRICE_ID: "price_other", REFERRAL_COUPON_ID: "coup_other" }, () => withFetch(impl, async () => {
    await checkout.handler(event("ZTH-ALICESMI"));
    const body = String(calls.stripe[0].body);
    assert.ok(body.includes("line_items%5B0%5D%5Bprice%5D=price_other"));
    assert.ok(body.includes("discounts%5B0%5D%5Bcoupon%5D=coup_other"));
  }));
});
