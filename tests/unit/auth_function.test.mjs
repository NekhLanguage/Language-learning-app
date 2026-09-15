// Authentication cutover (Nekh 2026-09-15): the learner-facing functions
// identify the caller from the Supabase session token in the Authorization
// header, never from an email in the body.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../netlify/functions/auth.js");
const checkAccess = require("../../netlify/functions/checkAccess.js");
const loadUser = require("../../netlify/functions/loadUser.js");
const saveUser = require("../../netlify/functions/saveUser.js");
const authProvision = require("../../netlify/functions/authProvision.js");
const authConfig = require("../../netlify/functions/authConfig.js");

const PUB = "publishable-test-key";
const SEC = "secret-test-key";

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

// A fake Supabase: /auth/v1/user answers by token, /rest/v1/users by email.
function fakeSupabase({ tokens = {}, rows = {}, admin = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    const headers = init.headers || {};
    if (u.includes("/auth/v1/user")) {
      const token = String(headers.Authorization || "").replace(/^Bearer /, "");
      const user = tokens[token];
      return user
        ? new Response(JSON.stringify(user), { status: 200 })
        : new Response(JSON.stringify({ msg: "invalid" }), { status: 401 });
    }
    if (u.includes("/auth/v1/admin/users")) {
      const outcome = admin || { status: 200, body: {} };
      return new Response(JSON.stringify(outcome.body), { status: outcome.status });
    }
    if (u.includes("/rest/v1/users")) {
      const email = decodeURIComponent(/email=eq\.([^&]+)/.exec(u)[1]);
      if (init.method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      const row = rows[email];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fetchImpl, calls };
}

async function withFetch(fetchImpl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const ENV = { SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC };
const ALICE = { id: "u1", email: "Alice@Example.com" };
const req = (token, body = {}, extra = {}) => ({
  httpMethod: "POST",
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body),
  ...extra,
});

test("bearerToken reads the Authorization header case-insensitively", () => {
  assert.equal(auth.bearerToken({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(auth.bearerToken({ headers: { Authorization: "bearer  xyz " } }), "xyz");
  assert.equal(auth.bearerToken({ headers: {} }), null);
  assert.equal(auth.bearerToken({ headers: { authorization: "Basic abc" } }), null);
});

test("subscriptionActive: null none, infinity permanent, timestamps by clock", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  assert.equal(auth.subscriptionActive(null, now), false);
  assert.equal(auth.subscriptionActive(undefined, now), false);
  assert.equal(auth.subscriptionActive("", now), false);
  assert.equal(auth.subscriptionActive("infinity", now), true);
  assert.equal(auth.subscriptionActive("2027-01-15T20:40:39.075972+00:00", now), true);
  assert.equal(auth.subscriptionActive("2026-09-15T11:59:59+00:00", now), false);
  assert.equal(auth.subscriptionActive("garbage", now), false);
});

test("verifySession: no token → null, bad token → null, good token → lowercased email", async () => {
  const { fetchImpl, calls } = fakeSupabase({ tokens: { good: ALICE } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    assert.equal(await auth.verifySession(req(null)), null);
    assert.equal(calls.length, 0, "no token means no round-trip");
    assert.equal(await auth.verifySession(req("bad")), null);
    assert.deepEqual(await auth.verifySession(req("good")), { email: "alice@example.com", id: "u1" });
    const authCall = calls.filter((c) => c.url.includes("/auth/v1/user")).at(-1);
    assert.equal(authCall.init.headers.apikey, PUB, "the user lookup uses the publishable key as apikey");
    assert.equal(authCall.init.headers.Authorization, "Bearer good");
  }));
});

test("verifySession throws (does not return null) when the publishable key is unset", async () => {
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
    await assert.rejects(() => auth.verifySession(req("good")), /SUPABASE_PUBLISHABLE_KEY/);
  });
});

test("checkAccess: 401 without a session, ignores a body email, reports the subscription", async () => {
  const rows = {
    "alice@example.com": { email: "alice@example.com", access_until: "infinity" },
    "bob@example.com": { email: "bob@example.com", access_until: null },
  };
  const { fetchImpl } = fakeSupabase({ tokens: { alice: ALICE, bob: { id: "u2", email: "bob@example.com" }, carol: { id: "u3", email: "carol@example.com" } }, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const anon = await checkAccess.handler(req(null, { email: "alice@example.com" }));
    assert.equal(anon.statusCode, 401);
    assert.equal(JSON.parse(anon.body).allowed, false);

    const alice = await checkAccess.handler(req("alice", { email: "someone-else@example.com" }));
    assert.equal(alice.statusCode, 200);
    assert.deepEqual(JSON.parse(alice.body), { allowed: true, email: "alice@example.com", subscribed: true });

    const bob = await checkAccess.handler(req("bob"));
    assert.deepEqual(JSON.parse(bob.body), { allowed: true, email: "bob@example.com", subscribed: false });

    const carol = await checkAccess.handler(req("carol"));
    assert.deepEqual(JSON.parse(carol.body), { allowed: false, email: "carol@example.com", subscribed: false });
  }));
});

test("checkAccess: 503 (not 401) when the publishable key is unset", async () => {
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
    const res = await checkAccess.handler(req("alice"));
    assert.equal(res.statusCode, 503);
  });
});

test("loadUser reads only the session's own row and ignores a body email", async () => {
  const rows = {
    "alice@example.com": { email: "alice@example.com", data: { runs: { pt: {} }, id: "alice-blob" } },
    "bob@example.com": { email: "bob@example.com", data: { id: "bob-blob" } },
  };
  const { fetchImpl, calls } = fakeSupabase({ tokens: { alice: ALICE }, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const anon = await loadUser.handler(req(null, { email: "bob@example.com" }));
    assert.equal(anon.statusCode, 401);

    const res = await loadUser.handler(req("alice", { email: "bob@example.com" }));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).user.id, "alice-blob");
    const restCall = calls.find((c) => c.url.includes("/rest/v1/users"));
    assert.match(restCall.url, /email=eq\.alice%40example\.com/);
  }));
});

test("saveUser PATCHes the session's own row and ignores a body email", async () => {
  const { fetchImpl, calls } = fakeSupabase({ tokens: { alice: ALICE }, rows: { "alice@example.com": { email: "alice@example.com" } } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const anon = await saveUser.handler(req(null, { email: "alice@example.com", user: { id: "x" } }));
    assert.equal(anon.statusCode, 401);

    const missing = await saveUser.handler(req("alice", {}));
    assert.equal(missing.statusCode, 400);

    const res = await saveUser.handler(req("alice", { email: "bob@example.com", user: { id: "x", runs: {} } }));
    assert.equal(res.statusCode, 200);
    const patch = calls.find((c) => c.init.method === "PATCH");
    assert.ok(patch, "saves go through PATCH, never an upsert that could create a row");
    assert.match(patch.url, /email=eq\.alice%40example\.com/);
    assert.deepEqual(JSON.parse(patch.init.body), { data: { id: "x", runs: {} } });
    assert.equal(patch.init.headers.apikey, PUB);
  }));
});

test("authProvision creates the auth account only for emails with a users row, same answer either way", async () => {
  const rows = { "alice@example.com": { email: "alice@example.com", access_until: null } };
  const { fetchImpl, calls } = fakeSupabase({ rows, admin: { status: 200, body: { id: "new" } } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const known = await authProvision.handler(req(null, { email: " Alice@Example.com " }));
    assert.equal(known.statusCode, 200);
    assert.deepEqual(JSON.parse(known.body), { ok: true });
    const adminCall = calls.find((c) => c.url.includes("/auth/v1/admin/users"));
    assert.ok(adminCall, "known email → admin createUser");
    assert.equal(adminCall.init.headers.apikey, SEC, "admin API uses the secret key");
    assert.deepEqual(JSON.parse(adminCall.init.body), { email: "alice@example.com", email_confirm: true });

    calls.length = 0;
    const unknown = await authProvision.handler(req(null, { email: "nobody@example.com" }));
    assert.equal(unknown.statusCode, 200);
    assert.deepEqual(JSON.parse(unknown.body), { ok: true });
    assert.ok(!calls.some((c) => c.url.includes("/auth/v1/admin")), "unknown email → no account created");

    const bad = await authProvision.handler(req(null, { email: "not-an-email" }));
    assert.equal(bad.statusCode, 400);
    const get = await authProvision.handler({ httpMethod: "GET", headers: {}, body: "" });
    assert.equal(get.statusCode, 405);
  }));
});

test("authProvision treats an already-registered email as success", async () => {
  const rows = { "alice@example.com": { email: "alice@example.com" } };
  const { fetchImpl } = fakeSupabase({ rows, admin: { status: 422, body: { msg: "A user with this email address has already been registered" } } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const res = await authProvision.handler(req(null, { email: "alice@example.com" }));
    assert.equal(res.statusCode, 200);
  }));
});

test("authProvision 503s for a known email when the secret key is unset", async () => {
  const rows = { "alice@example.com": { email: "alice@example.com" } };
  const { fetchImpl } = fakeSupabase({ rows });
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: undefined }, () => withFetch(fetchImpl, async () => {
    const res = await authProvision.handler(req(null, { email: "alice@example.com" }));
    assert.equal(res.statusCode, 503);
  }));
});

test("authConfig hands the browser the URL and publishable key from the environment, 503 without", async () => {
  await withEnv(ENV, async () => {
    const res = await authConfig.handler({ httpMethod: "GET", headers: {} });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.match(body.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
    assert.equal(body.publishableKey, PUB);
  });
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
    const res = await authConfig.handler({ httpMethod: "GET", headers: {} });
    assert.equal(res.statusCode, 503);
  });
});
