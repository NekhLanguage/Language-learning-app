// Referral program (Nekh 2026-09-17; reworked with the one-time app, Dan
// 2026-10-22): the referral function hands an app owner a code and reads
// their free-month rewards; identity from the session.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const referral = require("../../netlify/functions/referral.js");

const PUB = "publishable-test-key";
const SEC = "secret-test-key";

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

// Fake Supabase: auth by token; tables in memory.
function fakeSupabase({ tokens = {}, users = {}, codes = {}, referrals = [], takenCodes = [], rewardColumns = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    const headers = init.headers || {};
    if (u.includes("/auth/v1/user")) {
      const token = String(headers.Authorization || "").replace(/^Bearer /, "");
      const user = tokens[token];
      return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response("{}", { status: 401 });
    }
    const email = decodeURIComponent((/email=eq\.([^&]+)/.exec(u) || [])[1] || "");
    if (u.includes("/rest/v1/users?")) {
      const row = users[email];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes("/rest/v1/referral_codes") && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (codes[body.email]) return new Response('{"message":"duplicate key value violates unique constraint \\"referral_codes_pkey\\""}', { status: 409 });
      if (takenCodes.includes(body.code) || Object.values(codes).some((c) => c.code === body.code)) {
        return new Response('{"message":"duplicate key value violates unique constraint \\"referral_codes_code_key\\""}', { status: 409 });
      }
      codes[body.email] = { code: body.code, accepted_terms_at: "2026-09-17T00:00:00Z" };
      return new Response(null, { status: 201 });
    }
    if (u.includes("/rest/v1/referral_codes?")) {
      const row = codes[email];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes("/rest/v1/referrals?")) {
      if (u.includes("anna_reward") && !rewardColumns) return new Response('{"code":"42703"}', { status: 400 });
      let mine = referrals.filter((r) => r.referrer_email === decodeURIComponent((/referrer_email=eq\.([^&]+)/.exec(u) || [])[1] || ""));
      if (u.includes("anna_reward_granted_at=not.is.null")) mine = mine.filter((r) => r.anna_reward_granted_at);
      return new Response(JSON.stringify(mine), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fetchImpl, calls, codes };
}

const ENV = { SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC };
const req = (token, method = "GET", body) => ({
  httpMethod: method,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: body ? JSON.stringify(body) : "",
});
const ALICE = { id: "u1", email: "alice.smith@example.com" };

test("codeFor: ZTH- plus the email's local part, numbered on collisions", () => {
  assert.equal(referral.codeFor("alice.smith@example.com"), "ZTH-ALICESMI");
  assert.equal(referral.codeFor("alice.smith@example.com", 1), "ZTH-ALICESMI01");
  assert.equal(referral.codeFor("émile@example.com"), "ZTH-MILE");
  assert.equal(referral.codeFor("@@@"), "ZTH-FRIEND");
  assert.match(referral.linkFor("ZTH-ALICESMI"), /^https:\/\/zerotoherolanguage\.netlify\.app\/r\/ZTH-ALICESMI$/);
});

test("503 without the secret key, 401 without a session", async () => {
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: undefined }, async () => {
    assert.equal((await referral.handler(req("alice"))).statusCode, 503);
  });
  const { fetchImpl } = fakeSupabase({ tokens: { alice: ALICE } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    assert.equal((await referral.handler(req(null))).statusCode, 401);
  }));
});

test("GET before accepting: no code; any app owner is eligible, a free-tier account is not", async () => {
  const { fetchImpl } = fakeSupabase({
    tokens: { alice: ALICE, bob: { id: "u2", email: "bob@example.com" }, lapsed: { id: "u3", email: "lapsed@example.com" } },
    users: {
      "alice.smith@example.com": { access_tier: "paid" },
      "bob@example.com": { access_tier: "trial" },
      "lapsed@example.com": { access_tier: null },
    },
  });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const a = JSON.parse((await referral.handler(req("alice"))).body);
    assert.deepEqual({ code: a.code, link: a.link, eligible: a.eligible }, { code: null, link: null, eligible: true });
    assert.deepEqual(a.stats, { friends: 0, monthsEarned: 0, monthsPending: 0 });
    assert.deepEqual(a.config, { appPriceCents: 1900, friendPriceCents: 1520, friendPct: 20, rewardDays: 30 });
    assert.equal(JSON.parse((await referral.handler(req("bob"))).body).eligible, false, "free tier can't refer");
    assert.equal(JSON.parse((await referral.handler(req("lapsed"))).body).eligible, true, "an owner whose Anna lapsed still can — the reward brings her back");
  }));
});

test("POST accept creates the code for an app owner, skipping taken codes; not for a free-tier account", async () => {
  const { fetchImpl, codes } = fakeSupabase({
    tokens: { alice: ALICE, bob: { id: "u2", email: "bob@example.com" } },
    users: { "alice.smith@example.com": { access_tier: "paid" }, "bob@example.com": { access_tier: "trial" } },
    takenCodes: ["ZTH-ALICESMI"],
  });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const noAccept = await referral.handler(req("alice", "POST", {}));
    assert.equal(noAccept.statusCode, 400);

    const res = await referral.handler(req("alice", "POST", { accept: true }));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.code, "ZTH-ALICESMI01");
    assert.match(body.link, /\/r\/ZTH-ALICESMI01$/);
    assert.equal(codes["alice.smith@example.com"].code, "ZTH-ALICESMI01");

    const again = JSON.parse((await referral.handler(req("alice", "POST", { accept: true }))).body);
    assert.equal(again.code, "ZTH-ALICESMI01");

    const bob = await referral.handler(req("bob", "POST", { accept: true }));
    assert.equal(bob.statusCode, 403);
  }));
});

test("GET with a code counts free months earned and the ones still pending", async () => {
  const me = "alice.smith@example.com";
  const opts = {
    tokens: { alice: ALICE },
    users: { [me]: { access_tier: "paid" } },
    codes: { [me]: { code: "ZTH-ALICESMI", accepted_terms_at: "2026-09-17T00:00:00Z" } },
    referrals: [
      { referrer_email: me, anna_reward_granted_at: "2026-10-26T00:00:00Z", anna_reward_kind: "window", anna_reward_applied_at: "2026-10-26T00:00:00Z" },
      { referrer_email: me, anna_reward_granted_at: "2026-10-27T00:00:00Z", anna_reward_kind: "pending", anna_reward_applied_at: null },
      { referrer_email: me, anna_reward_granted_at: "2026-10-27T00:00:00Z", anna_reward_kind: "invoice_credit", anna_reward_applied_at: "2026-10-28T06:00:00Z" },
      { referrer_email: me, anna_reward_granted_at: null },
    ],
  };
  await withEnv(ENV, () => withFetch(fakeSupabase(opts).fetchImpl, async () => {
    const body = JSON.parse((await referral.handler(req("alice"))).body);
    assert.equal(body.code, "ZTH-ALICESMI");
    assert.deepEqual(body.stats, { friends: 3, monthsEarned: 3, monthsPending: 1 });
  }));
  await withEnv(ENV, () => withFetch(fakeSupabase({ ...opts, rewardColumns: false }).fetchImpl, async () => {
    const body = JSON.parse((await referral.handler(req("alice"))).body);
    assert.deepEqual(body.stats, { friends: 4, monthsEarned: 4, monthsPending: 0 }, "before the migration every referral counts as a month");
  }));
});
