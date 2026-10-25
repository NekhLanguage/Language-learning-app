// Daily referral reward run (Dan 2026-10-22): a pending free Anna month for
// a referrer who subscribes becomes a -$19 invoice item on their live Anna
// subscription; with no live subscription it becomes 30 more days of Anna.
// Never twice.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rewardRun = require("../../netlify/functions/referralRewardRun.js");

function fake({ referrals, users, subs }) {
  const stripeCalls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    if (u.hostname === "api.stripe.com") {
      stripeCalls.push({ path: u.pathname, method, body: init.body ? new URLSearchParams(init.body) : null, idem: init.headers["Idempotency-Key"] });
      if (u.pathname.endsWith("/customers/search")) {
        const email = /email:'([^']+)'/.exec(u.searchParams.get("query"))[1];
        return Response.json({ data: subs[email] ? [{ id: `cus_${email}` }] : [] });
      }
      if (u.pathname.endsWith("/subscriptions")) {
        const email = u.searchParams.get("customer").slice(4);
        return Response.json({ data: subs[email] || [] });
      }
      if (u.pathname.endsWith("/invoiceitems")) return Response.json({ id: "ii_1" });
    }
    const table = u.pathname.split("/").pop();
    const body = init.body ? JSON.parse(init.body) : null;
    const rows = table === "referrals" ? referrals : users;
    const filters = [...u.searchParams].filter(([k]) => !["select", "order"].includes(k));
    const hit = rows.filter((r) => filters.every(([k, v]) => v === "is.null" ? r[k] == null : v.startsWith("eq.") ? String(r[k]) === v.slice(3) : true));
    if (method === "GET") return Response.json(hit);
    hit.forEach((r) => Object.assign(r, body));
    return /representation/.test(init.headers.Prefer || "") ? Response.json(hit) : new Response(null, { status: 204 });
  };
  return { impl, stripeCalls };
}

async function withEnv(fn) {
  const saved = { ...process.env };
  process.env.SUPABASE_SECRET_KEY = "sec";
  process.env.STRIPE_SECRET_KEY = "sk";
  try { return await fn(); } finally { process.env = saved; }
}

test("pending rewards settle as invoice credit (live Anna sub) or window month (none), once", async () => {
  const day = 86400000;
  const referrals = [
    { id: 1, referrer_email: "sub@x.com", anna_reward_kind: "pending", anna_reward_applied_at: null },
    { id: 2, referrer_email: "gone@x.com", anna_reward_kind: "pending", anna_reward_applied_at: null },
    { id: 3, referrer_email: "sub@x.com", anna_reward_kind: "window", anna_reward_applied_at: "2026-10-01T00:00:00Z" },
  ];
  const until = new Date(Date.now() + 10 * day).toISOString();
  const users = [{ email: "sub@x.com", access_until: until }, { email: "gone@x.com", access_until: until }];
  const subs = {
    "sub@x.com": [{ id: "sub_anna", status: "trialing", metadata: { sku: "zth_anna" } }],
    "gone@x.com": [{ id: "sub_old", status: "canceled", metadata: { sku: "zth_anna" } }],
  };
  const { impl, stripeCalls } = fake({ referrals, users, subs });
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    const report = await withEnv(() => rewardRun.run());
    assert.deepEqual(report.applied.map((a) => [a.id, a.kind]), [[1, "invoice_credit"], [2, "window"]]);
    const item = stripeCalls.find((c) => c.path.endsWith("/invoiceitems"));
    assert.equal(item.body.get("amount"), "-1900");
    assert.equal(item.body.get("subscription"), "sub_anna");
    assert.equal(item.idem, "referral-reward-1");
    assert.equal(referrals[0].anna_reward_kind, "invoice_credit");
    assert.ok(referrals[0].anna_reward_applied_at);
    assert.equal(users[0].access_until, until, "a credited subscriber's window is untouched");
    const gone = (Date.parse(users[1].access_until) - Date.parse(until)) / day;
    assert.ok(Math.abs(gone - 30) < 0.01, "no live subscription → 30 more days");

    stripeCalls.length = 0;
    const again = await withEnv(() => rewardRun.run());
    assert.equal(again.applied.length, 0);
    assert.equal(stripeCalls.length, 0, "nothing pending → no Stripe calls");
  } finally { globalThis.fetch = real; }
});
