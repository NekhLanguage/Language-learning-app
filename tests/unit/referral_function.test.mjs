// Referral program (Nekh 2026-09-17): the referral function hands a
// subscriber a code and reads their stats; identity from the session.

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
function fakeSupabase({ tokens = {}, users = {}, codes = {}, referrals = [], commissions = [], takenCodes = [] } = {}) {
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
      const mine = referrals.filter((r) => r.referrer_email === decodeURIComponent((/referrer_email=eq\.([^&]+)/.exec(u) || [])[1] || "") && r.status === "active");
      return new Response(JSON.stringify(mine), { status: 200 });
    }
    if (u.includes("/rest/v1/commissions?")) {
      const mine = commissions.filter((c) => c.referrer_email === decodeURIComponent((/referrer_email=eq\.([^&]+)/.exec(u) || [])[1] || ""));
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
  assert.match(referral.linkFor("ZTH-ALICESMI"), /^https:\/\/buy\.stripe\.com\/.+\?client_reference_id=ZTH-ALICESMI$/);
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

test("GET before accepting: no code, eligibility follows the subscription window", async () => {
  const { fetchImpl } = fakeSupabase({
    tokens: { alice: ALICE, bob: { id: "u2", email: "bob@example.com" } },
    users: { "alice.smith@example.com": { access_until: "infinity" }, "bob@example.com": { access_until: null } },
  });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const a = JSON.parse((await referral.handler(req("alice"))).body);
    assert.deepEqual({ code: a.code, link: a.link, eligible: a.eligible }, { code: null, link: null, eligible: true });
    assert.equal(a.stats.lifetimeCents, 0);
    const b = JSON.parse((await referral.handler(req("bob"))).body);
    assert.equal(b.eligible, false);
  }));
});

test("POST accept creates the code for a subscriber, skipping taken codes; not for a lapsed one", async () => {
  const { fetchImpl, codes } = fakeSupabase({
    tokens: { alice: ALICE, bob: { id: "u2", email: "bob@example.com" } },
    users: { "alice.smith@example.com": { access_until: "2099-01-01T00:00:00Z" }, "bob@example.com": { access_until: "2020-01-01T00:00:00Z" } },
    takenCodes: ["ZTH-ALICESMI"],
  });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const noAccept = await referral.handler(req("alice", "POST", {}));
    assert.equal(noAccept.statusCode, 400);

    const res = await referral.handler(req("alice", "POST", { accept: true }));
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.code, "ZTH-ALICESMI01");
    assert.match(body.link, /client_reference_id=ZTH-ALICESMI01$/);
    assert.equal(codes["alice.smith@example.com"].code, "ZTH-ALICESMI01");

    // Idempotent: a second accept returns the same code.
    const again = JSON.parse((await referral.handler(req("alice", "POST", { accept: true }))).body);
    assert.equal(again.code, "ZTH-ALICESMI01");

    const bob = await referral.handler(req("bob", "POST", { accept: true }));
    assert.equal(bob.statusCode, 403);
  }));
});

test("GET with a code sums the stats by status", async () => {
  const { fetchImpl } = fakeSupabase({
    tokens: { alice: ALICE },
    users: { "alice.smith@example.com": { access_until: "infinity" } },
    codes: { "alice.smith@example.com": { code: "ZTH-ALICESMI", accepted_terms_at: "2026-09-17T00:00:00Z" } },
    referrals: [
      { referrer_email: "alice.smith@example.com", status: "active" },
      { referrer_email: "alice.smith@example.com", status: "active" },
      { referrer_email: "alice.smith@example.com", status: "ended" },
    ],
    commissions: [
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "pending" },
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "available" },
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "credited" },
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "paid" },
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "reversed" },
      { referrer_email: "alice.smith@example.com", amount_cents: 380, status: "forfeited" },
    ],
  });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const body = JSON.parse((await referral.handler(req("alice"))).body);
    assert.equal(body.code, "ZTH-ALICESMI");
    assert.deepEqual(body.stats, { activeReferrals: 2, pendingCents: 380, availableCents: 380, creditedCents: 380, paidCents: 380, lifetimeCents: 1520 });
  }));
});
