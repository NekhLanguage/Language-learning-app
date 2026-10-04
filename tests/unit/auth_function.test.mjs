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
const emailOptIn = require("../../netlify/functions/emailOptIn.js");

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
      if (init.method === "POST") {
        // Free-tier provisioning: insert with ignore-duplicates.
        const body = JSON.parse(init.body);
        if (rows[body.email]) return new Response("[]", { status: 201 });
        rows[body.email] = { access_until: null, ...body };
        return new Response(JSON.stringify([rows[body.email]]), { status: 201 });
      }
      const email = decodeURIComponent(/email=eq\.([^&]+)/.exec(u)[1]);
      if (init.method === "PATCH") {
        // return=representation (emailOptIn): the patched rows, honouring
        // the `email_opt_in_at=is.null` guard; other PATCHes answer 204.
        if (/return=representation/.test(String(headers.Prefer || ""))) {
          const row = rows[email];
          const guarded = u.includes("email_opt_in_at=is.null") && row && row.email_opt_in_at;
          if (!row || guarded) return new Response("[]", { status: 200 });
          Object.assign(row, JSON.parse(init.body));
          return new Response(JSON.stringify([row]), { status: 200 });
        }
        return new Response(null, { status: 204 });
      }
      const row = rows[email];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }
    if (u.includes("/rest/v1/site_events")) {
      return new Response(null, { status: 201 });
    }
    if (u.includes("/api/subscribe")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
    assert.deepEqual(await auth.verifySession(req("good")), { email: "alice@example.com", id: "u1", metadata: {} });
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
    assert.deepEqual(JSON.parse(alice.body), { allowed: true, email: "alice@example.com", tier: "paid", freeLessons: 3, subscribed: true, emailOptInAsked: true });

    const bob = await checkAccess.handler(req("bob"));
    assert.deepEqual(JSON.parse(bob.body), { allowed: true, email: "bob@example.com", tier: "paid", freeLessons: 3, subscribed: false, emailOptInAsked: true });
  }));
});

test("checkAccess: a verified email with no row becomes a free-tier account, once, and existing rows are never written", async () => {
  const rows = {
    "alice@example.com": { email: "alice@example.com", access_until: "infinity", access_tier: null },
  };
  const { fetchImpl, calls } = fakeSupabase({ tokens: { alice: ALICE, carol: { id: "u3", email: "carol@example.com" } }, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const carol = await checkAccess.handler(req("carol"));
    assert.deepEqual(JSON.parse(carol.body), { allowed: true, email: "carol@example.com", tier: "trial", freeLessons: 3, subscribed: false, emailOptInAsked: false });
    const insert = calls.find((c) => c.url.includes("/rest/v1/users") && c.init.method === "POST");
    assert.equal(insert.init.headers.apikey, SEC, "users writes use the secret key");
    assert.match(insert.init.headers.Prefer, /ignore-duplicates/, "an existing row can never be overwritten");
    assert.equal(JSON.parse(insert.init.body).access_tier, "trial");
    const events = calls.filter((c) => c.url.includes("/rest/v1/site_events")).map((c) => JSON.parse(c.init.body));
    assert.deepEqual(events.map((e) => e.event_type), ["trial_start"]);
    assert.ok(!events[0].session_id_hash.includes("carol"), "the funnel id is not the email");
    assert.ok(!calls.some((c) => c.url.includes("/api/subscribe")), "no consent → never handed to MailerLite");

    calls.length = 0;
    const again = await checkAccess.handler(req("carol"));
    assert.equal(JSON.parse(again.body).tier, "trial");
    assert.ok(!calls.some((c) => c.url.includes("site_events")), "trial_start fires once");

    calls.length = 0;
    await checkAccess.handler(req("alice"));
    assert.ok(!calls.some((c) => c.init.method === "POST" || c.init.method === "PATCH"), "a paying row is only read");
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
    const body = JSON.parse(patch.init.body);
    assert.deepEqual(body.data, { id: "x", runs: {} });
    // Leaderboard v1: the two counters ride the same PATCH (leaderboard_function.test.mjs covers them).
    assert.deepEqual(Object.keys(body).sort(), ["data", "lb_anna", "lb_updated_at", "lb_words"]);
    assert.equal(patch.init.headers.apikey, SEC, "users writes use the secret key (the table is locked to it)");
  }));
});

test("saveUser: a free-tier account cannot store a run past lesson 3; paying rows are not gated", async () => {
  const blob = (n) => ({ runs: { pt: { releasedBundleIds: Array.from({ length: n }, (_, i) => `core_${i}`) } } });
  const rows = {
    "alice@example.com": { email: "alice@example.com", access_tier: null },
    "tina@example.com": { email: "tina@example.com", access_tier: "trial" },
  };
  const { fetchImpl, calls } = fakeSupabase({ tokens: { alice: ALICE, tina: { id: "t", email: "tina@example.com" } }, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    assert.equal((await saveUser.handler(req("tina", { user: blob(3) }))).statusCode, 200);
    calls.length = 0;
    const over = await saveUser.handler(req("tina", { user: blob(4) }));
    assert.equal(over.statusCode, 403);
    assert.equal(JSON.parse(over.body).code, "paywall");
    assert.ok(!calls.some((c) => c.init.method === "PATCH"), "the over-limit blob is never written");
    assert.equal((await saveUser.handler(req("alice", { user: blob(12) }))).statusCode, 200);
  }));
});

test("authProvision creates the auth account for any valid email, same answer for every address", async () => {
  const rows = { "alice@example.com": { email: "alice@example.com", access_until: null } };
  const { fetchImpl, calls } = fakeSupabase({ rows, admin: { status: 200, body: { id: "new" } } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const known = await authProvision.handler(req(null, { email: " Alice@Example.com " }));
    assert.equal(known.statusCode, 200);
    assert.deepEqual(JSON.parse(known.body), { ok: true });
    const adminCall = calls.find((c) => c.url.includes("/auth/v1/admin/users"));
    assert.ok(adminCall, "known email → admin createUser");
    assert.equal(adminCall.init.headers.apikey, SEC, "admin API uses the secret key");
    const adminBody = JSON.parse(adminCall.init.body);
    assert.equal(adminBody.email, "alice@example.com");
    assert.equal(adminBody.email_confirm, true);
    // The form's answer rides on the new account: asked now, not opted in.
    assert.ok(adminBody.user_metadata.email_opt_in_asked_at);
    assert.equal(adminBody.user_metadata.email_opt_in_at, null);

    calls.length = 0;
    const unknown = await authProvision.handler(req(null, { email: "nobody@example.com" }));
    assert.equal(unknown.statusCode, 200);
    assert.deepEqual(JSON.parse(unknown.body), { ok: true });
    assert.ok(calls.some((c) => c.url.includes("/auth/v1/admin")), "free tier: a new email gets an account");
    assert.ok(!calls.some((c) => c.url.includes("/rest/v1/users")), "no users row until the inbox owner signs in");

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

// ── Email consent (Austin via Nekh 2026-10-04) ──────────────────────────────

test("authProvision stores a ticked box as user_metadata; the sign-in form's path sends none", async () => {
  const { fetchImpl, calls } = fakeSupabase({ admin: { status: 200, body: { id: "new" } } });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    await authProvision.handler(req(null, { email: "dana@example.com", emailOptIn: true }));
    const meta = JSON.parse(calls.find((c) => c.url.includes("/auth/v1/admin/users")).init.body).user_metadata;
    assert.ok(meta.email_opt_in_at, "ticked → opted-in timestamp");
    assert.equal(meta.email_opt_in_at, meta.email_opt_in_asked_at);
    calls.length = 0;
    await authProvision.handler(req(null, { email: "erin@example.com", emailOptIn: "yes" }));
    const meta2 = JSON.parse(calls.find((c) => c.url.includes("/auth/v1/admin/users")).init.body).user_metadata;
    assert.equal(meta2.email_opt_in_at, null, "only a literal true counts as consent");
  }));
});

test("checkAccess: a first sign-in copies the form's consent onto the row and hands a ticked address to MailerLite", async () => {
  const asked = "2026-10-04T12:00:00.000Z";
  const tokens = {
    ticked: { id: "u4", email: "dana@example.com", user_metadata: { email_opt_in_asked_at: asked, email_opt_in_at: asked } },
    unticked: { id: "u5", email: "erin@example.com", user_metadata: { email_opt_in_asked_at: asked, email_opt_in_at: null } },
  };
  const rows = {};
  const { fetchImpl, calls } = fakeSupabase({ tokens, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const dana = await checkAccess.handler(req("ticked"));
    assert.equal(JSON.parse(dana.body).emailOptInAsked, true);
    assert.equal(rows["dana@example.com"].email_opt_in_at, asked);
    assert.equal(rows["dana@example.com"].email_opt_in_asked_at, asked);
    const sub = calls.find((c) => c.url.includes("/api/subscribe"));
    assert.equal(JSON.parse(sub.init.body).source, "app-trial");
    assert.equal(JSON.parse(sub.init.body).email, "dana@example.com");

    calls.length = 0;
    const erin = await checkAccess.handler(req("unticked"));
    assert.equal(JSON.parse(erin.body).emailOptInAsked, true, "asked on the form → never asked again");
    assert.equal(rows["erin@example.com"].email_opt_in_at, undefined);
    assert.equal(rows["erin@example.com"].email_opt_in_asked_at, asked);
    assert.ok(!calls.some((c) => c.url.includes("/api/subscribe")), "unticked → MailerLite never sees the address");
  }));
});

test("emailOptIn: the one-time in-app answer stamps the row; ticked hands over once, unticked never; a paying row is never asked", async () => {
  const rows = {
    "frank@example.com": { email: "frank@example.com", access_until: null, access_tier: "trial", email_opt_in_at: null, email_opt_in_asked_at: null },
    "gina@example.com": { email: "gina@example.com", access_until: null, access_tier: "trial", email_opt_in_at: null, email_opt_in_asked_at: null },
    "alice@example.com": { email: "alice@example.com", access_until: "infinity", access_tier: null, email_opt_in_at: null, email_opt_in_asked_at: null },
  };
  const tokens = { frank: { id: "u6", email: "frank@example.com" }, gina: { id: "u7", email: "gina@example.com" }, alice: ALICE };
  const { fetchImpl, calls } = fakeSupabase({ tokens, rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const anon = await emailOptIn.handler(req(null, { optIn: true }));
    assert.equal(anon.statusCode, 401);

    const yes = await emailOptIn.handler(req("frank", { optIn: true }));
    assert.deepEqual(JSON.parse(yes.body), { ok: true, optedIn: true, emailOptInAsked: true });
    assert.ok(rows["frank@example.com"].email_opt_in_at);
    assert.ok(rows["frank@example.com"].email_opt_in_asked_at);
    assert.equal(calls.filter((c) => c.url.includes("/api/subscribe")).length, 1);
    calls.length = 0;
    await emailOptIn.handler(req("frank", { optIn: true }));
    assert.equal(calls.filter((c) => c.url.includes("/api/subscribe")).length, 0, "a second answer never re-subscribes");

    calls.length = 0;
    const no = await emailOptIn.handler(req("gina", { optIn: false }));
    assert.deepEqual(JSON.parse(no.body), { ok: true, optedIn: false, emailOptInAsked: true });
    assert.equal(rows["gina@example.com"].email_opt_in_at, null);
    assert.ok(rows["gina@example.com"].email_opt_in_asked_at);
    assert.ok(!calls.some((c) => c.url.includes("/api/subscribe")));

    const paid = await checkAccess.handler(req("alice"));
    assert.equal(JSON.parse(paid.body).emailOptInAsked, true, "paying rows are never asked");
    const frank = await checkAccess.handler(req("frank"));
    assert.equal(JSON.parse(frank.body).emailOptInAsked, true, "answered once → asked");
  }));
});
