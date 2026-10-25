// Anna opt-in checkout (pricing rebuild, Dan 2026-10-22): the first charge
// lands on the day Anna would have locked (opt-in during the free month),
// or today (opt-in after it). Nothing is charged for a learner who never
// opts in — that path never reaches this function.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const annaCheckout = require("../../netlify/functions/annaCheckout.js");

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-01T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

test("firstChargePlan: trial to the lock date, anchor inside Stripe's 48h trial floor, today once locked", () => {
  const { firstChargePlan } = annaCheckout;
  assert.deepEqual(firstChargePlan(iso(NOW + 20 * DAY), NOW), { kind: "trial", at: Math.floor((NOW + 20 * DAY) / 1000) });
  assert.deepEqual(firstChargePlan(iso(NOW + 50 * HOUR), NOW).kind, "trial");
  assert.deepEqual(firstChargePlan(iso(NOW + 20 * HOUR), NOW), { kind: "anchor", at: Math.floor((NOW + 20 * HOUR) / 1000) }, "the 1-day popup still bills on the lock date");
  assert.equal(firstChargePlan(iso(NOW + 30 * 60000), NOW).kind, "now");
  assert.equal(firstChargePlan(iso(NOW - 3 * DAY), NOW).kind, "now", "opt-in after expiry: billed today");
  assert.equal(firstChargePlan(null, NOW).kind, "now");
});

test("sessionForm: a subscription for the Anna price, card collected, sku zth_anna on session and subscription", () => {
  const trial = annaCheckout.sessionForm("a@x.com", "price_anna", { kind: "trial", at: 1800000000 });
  assert.equal(trial.get("mode"), "subscription");
  assert.equal(trial.get("line_items[0][price]"), "price_anna");
  assert.equal(trial.get("payment_method_collection"), "always");
  assert.equal(trial.get("customer_email"), "a@x.com");
  assert.equal(trial.get("metadata[sku]"), "zth_anna");
  assert.equal(trial.get("subscription_data[metadata][sku]"), "zth_anna");
  assert.equal(trial.get("subscription_data[trial_end]"), "1800000000");
  assert.equal(trial.get("subscription_data[billing_cycle_anchor]"), null);

  const anchor = annaCheckout.sessionForm("a@x.com", "price_anna", { kind: "anchor", at: 1800000000 });
  assert.equal(anchor.get("subscription_data[billing_cycle_anchor]"), "1800000000");
  assert.equal(anchor.get("subscription_data[proration_behavior]"), "none");
  assert.equal(anchor.get("subscription_data[trial_end]"), null);

  const now = annaCheckout.sessionForm("a@x.com", "price_anna", { kind: "now" });
  assert.equal(now.get("subscription_data[trial_end]"), null);
  assert.equal(now.get("subscription_data[billing_cycle_anchor]"), null);
});

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; }
  return Promise.resolve().then(fn).finally(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
}

async function run(row, { token = "t" } = {}) {
  const stripe = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email: "a@x.com" }), { status: 200 });
    if (u.includes("/rest/v1/users")) return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    if (u.includes("api.stripe.com")) { stripe.push(new URLSearchParams(String(init.body))); return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_x" }), { status: 200 }); }
    throw new Error(`unexpected ${u}`);
  };
  try {
    const res = await withEnv({ SUPABASE_PUBLISHABLE_KEY: "pub", SUPABASE_SECRET_KEY: "sec", STRIPE_SECRET_KEY: "sk" }, () =>
      annaCheckout.handler({ httpMethod: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: "{}" }));
    return { res, body: JSON.parse(res.body), stripe };
  } finally { globalThis.fetch = real; }
}

test("handler: paid learner in the free month gets a session that bills on the lock date", async () => {
  const until = iso(Date.now() + 10 * DAY);
  const { res, body, stripe } = await run({ email: "a@x.com", access_tier: "paid", access_until: until, anna_trial_started_at: iso(Date.now() - 20 * DAY) });
  assert.equal(res.statusCode, 200);
  assert.equal(body.url, "https://checkout.stripe.com/c/pay/cs_x");
  assert.equal(stripe[0].get("subscription_data[trial_end]"), String(Math.floor(Date.parse(until) / 1000)));
  assert.equal(stripe[0].get("line_items[0][price]"), annaCheckout.DEFAULT_ANNA_PRICE_ID);
});

test("handler: refuses free-tier, permanent and already-subscribed rows, and anonymous calls", async () => {
  assert.equal((await run({ access_tier: "trial", access_until: null })).res.statusCode, 403);
  assert.equal((await run({ access_tier: "paid", access_until: "infinity" })).res.statusCode, 409);
  const sub = await run({ access_tier: "paid", access_until: iso(Date.now() + 20 * DAY), anna_subscribed_at: iso(Date.now() - DAY) });
  assert.equal(sub.res.statusCode, 409);
  assert.equal(sub.body.code, "subscribed");
  assert.equal((await run(null, { token: null })).res.statusCode, 401);
  const lapsedSub = await run({ access_tier: "paid", access_until: iso(Date.now() - DAY), anna_subscribed_at: iso(Date.now() - 60 * DAY) });
  assert.equal(lapsedSub.res.statusCode, 200, "a cancelled, lapsed subscriber may opt in again");
  assert.equal(lapsedSub.stripe[0].get("subscription_data[trial_end]"), null, "…and is billed today");
});
