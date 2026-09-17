// Monthly referral credit planning (Nekh 2026-09-17): whole commissions,
// oldest first, up to one month's price; the rest stays for the cash tier.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { groupByReferrer, planCredit, MONTHLY_PRICE_CENTS } = require("../../netlify/functions/referral_credit.js");

const row = (id, email, cents, earned, currency = "usd") => ({ id, referrer_email: email, amount_cents: cents, earned_at: earned, currency });

test("groupByReferrer: per referrer, oldest first, case-insensitive email", () => {
  const groups = groupByReferrer([
    row(3, "A@x.com", 380, "2026-09-03"),
    row(1, "a@x.com", 380, "2026-09-01"),
    row(2, "b@x.com", 380, "2026-09-02"),
  ]);
  assert.deepEqual([...groups.keys()], ["a@x.com", "b@x.com"]);
  assert.deepEqual(groups.get("a@x.com").map((r) => r.id), [1, 3]);
});

test("planCredit: five $3.80 commissions fill a $19 month exactly; the sixth waits", () => {
  const rows = [1, 2, 3, 4, 5, 6].map((i) => row(i, "a@x.com", 380, `2026-09-0${i}`));
  const plan = planCredit(rows, MONTHLY_PRICE_CENTS);
  assert.deepEqual(plan.ids, [1, 2, 3, 4, 5]);
  assert.equal(plan.totalCents, 1900);
});

test("planCredit: stops before overshooting the cap and skips foreign currency and zero rows", () => {
  const rows = [row(1, "a@x.com", 1500, "2026-09-01"), row(2, "a@x.com", 500, "2026-09-02"), row(3, "a@x.com", 380, "2026-09-03")];
  assert.deepEqual(planCredit(rows, 1900), { ids: [1], totalCents: 1500 });
  assert.deepEqual(planCredit([row(1, "a@x.com", 380, "x", "nok"), row(2, "a@x.com", 0, "y")], 1900), { ids: [], totalCents: 0 });
});
