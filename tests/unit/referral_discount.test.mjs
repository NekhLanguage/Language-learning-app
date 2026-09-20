// Monthly referral discount planning (Angus's v1 spec, 2026-09-17): whole
// commissions, oldest first, never more than the referrer's own invoice
// and never past what is left of the yearly cap.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { config, groupByReferrer, planDiscount, appliedInYear, DEFAULT_RATE_BPS, DEFAULT_CAP_CENTS } = require("../../netlify/functions/referral_discount.js");

const row = (id, email, cents, earned, currency = "usd") => ({ id, referrer_email: email, amount_cents: cents, earned_at: earned, currency });

test("config: defaults, overridden by the environment", () => {
  delete process.env.REFERRAL_RATE_BPS;
  delete process.env.REFERRAL_CAP_CENTS;
  assert.deepEqual(config(), { rateBps: DEFAULT_RATE_BPS, capCents: DEFAULT_CAP_CENTS, monthlyPriceCents: 1900 });
  assert.equal(DEFAULT_RATE_BPS, 2000);
  process.env.REFERRAL_RATE_BPS = "1500";
  process.env.REFERRAL_CAP_CENTS = "25000";
  assert.deepEqual(config(), { rateBps: 1500, capCents: 25000, monthlyPriceCents: 1900 });
  process.env.REFERRAL_CAP_CENTS = "nonsense";
  assert.equal(config().capCents, DEFAULT_CAP_CENTS);
  delete process.env.REFERRAL_RATE_BPS;
  delete process.env.REFERRAL_CAP_CENTS;
});

test("groupByReferrer: per referrer, oldest first, case-insensitive email", () => {
  const groups = groupByReferrer([
    row(3, "A@x.com", 380, "2026-09-03"),
    row(1, "a@x.com", 380, "2026-09-01"),
    row(2, "b@x.com", 380, "2026-09-02"),
  ]);
  assert.deepEqual([...groups.keys()], ["a@x.com", "b@x.com"]);
  assert.deepEqual(groups.get("a@x.com").map((r) => r.id), [1, 3]);
});

test("planDiscount: five $3.80 commissions fill a $19 invoice exactly; the sixth waits", () => {
  const rows = [1, 2, 3, 4, 5, 6].map((i) => row(i, "a@x.com", 380, `2026-09-0${i}`));
  const plan = planDiscount(rows, { priceCents: 1900, capRemainingCents: 19000 });
  assert.deepEqual(plan.ids, [1, 2, 3, 4, 5]);
  assert.equal(plan.totalCents, 1900);
  assert.equal(plan.limitCents, 1900);
  assert.equal(plan.cappedByYear, false);
});

test("planDiscount: the yearly cap remainder is the limit when it is smaller than the price", () => {
  const rows = [1, 2, 3].map((i) => row(i, "a@x.com", 380, `2026-09-0${i}`));
  const plan = planDiscount(rows, { priceCents: 1900, capRemainingCents: 800 });
  assert.deepEqual(plan, { ids: [1, 2], totalCents: 760, limitCents: 800, cappedByYear: true });
  assert.deepEqual(planDiscount(rows, { priceCents: 1900, capRemainingCents: 0 }).ids, []);
  assert.deepEqual(planDiscount(rows, { priceCents: 1900, capRemainingCents: -50 }).ids, []);
});

test("planDiscount: never overshoots, skips foreign currency and zero rows", () => {
  const rows = [row(1, "a@x.com", 1500, "2026-09-01"), row(2, "a@x.com", 500, "2026-09-02"), row(3, "a@x.com", 380, "2026-09-03")];
  assert.deepEqual(planDiscount(rows, { priceCents: 1900, capRemainingCents: 19000 }).ids, [1]);
  assert.deepEqual(planDiscount([row(1, "a@x.com", 380, "x", "nok"), row(2, "a@x.com", 0, "y")], { priceCents: 1900, capRemainingCents: 19000 }).ids, []);
});

test("appliedInYear: only discount rows from the calendar year of `now`", () => {
  const payouts = [
    { kind: "discount", amount_cents: 1900, created_at: "2026-02-01T06:00:00Z" },
    { kind: "discount", amount_cents: 760, created_at: "2026-09-01T06:00:00Z" },
    { kind: "discount", amount_cents: 1900, created_at: "2025-12-01T06:00:00Z" },
    { kind: "cash", amount_cents: 5000, created_at: "2026-03-01T06:00:00Z" },
  ];
  assert.equal(appliedInYear(payouts, new Date("2026-09-17T00:00:00Z")), 2660);
  assert.equal(appliedInYear(payouts, new Date("2027-01-01T00:00:00Z")), 0);
  assert.equal(appliedInYear([], new Date()), 0);
});
