// Leaderboard v1: the leaderboard function (netlify/functions/leaderboard.js)
// and the counters saveUser writes alongside the blob, against a fake
// Supabase REST.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const leaderboard = require("../../netlify/functions/leaderboard.js");
const saveUser = require("../../netlify/functions/saveUser.js");

const PUB = "publishable-test-key";
const SEC = "secret-test-key";
const ENV = { SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC };
const ALICE = { id: "u1", email: "alice@example.com" };

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
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const req = (method, token, body) => ({
  httpMethod: method,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: body === undefined ? "" : JSON.stringify(body),
});

const parse = (res) => ({ status: res.statusCode, body: JSON.parse(res.body) });

// A fake users table with the lb_ columns. `rows` is email -> row.
function fakeSupabase({ rows, migrated = true, patchStatus = 204 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    const headers = init.headers || {};
    if (u.includes("/auth/v1/user")) {
      const token = String(headers.Authorization || "").replace(/^Bearer /, "");
      return token === "good"
        ? new Response(JSON.stringify(ALICE), { status: 200 })
        : new Response(JSON.stringify({ msg: "invalid" }), { status: 401 });
    }
    if (!u.includes("/rest/v1/users")) throw new Error(`unexpected fetch ${u}`);
    const query = new URL(u).searchParams;
    const method = (init.method || "GET").toUpperCase();
    const onBoard = Object.values(rows).filter((r) => r.lb_name);

    if (method === "PATCH") {
      const body = JSON.parse(init.body);
      if (!migrated && Object.keys(body).some((k) => k.startsWith("lb_"))) {
        return new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'lb_words' column of 'users' in the schema cache" }), { status: 400 });
      }
      if (patchStatus !== 204) return new Response("boom", { status: patchStatus });
      const email = decodeURIComponent(query.get("email").replace(/^eq\./, ""));
      const row = rows[email];
      if ("lb_name" in body && body.lb_name) {
        const clash = Object.entries(rows).find(([e, r]) => e !== email && r.lb_name && r.lb_name.toLowerCase() === body.lb_name.toLowerCase());
        if (clash) return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"users_lb_name_unique\"" }), { status: 409 });
      }
      if (row) Object.assign(row, body);
      const representation = String(headers.Prefer || "").includes("representation");
      return new Response(representation ? JSON.stringify(row ? [{ email }] : []) : null, { status: representation ? 200 : 204 });
    }

    if (!migrated && String(query.get("select") || "").includes("lb_")) {
      return new Response(JSON.stringify({ code: "42703", message: "column users.lb_name does not exist" }), { status: 400 });
    }

    if (method === "HEAD") {
      // count=exact: rows on the board with <col> > value.
      const col = ["lb_words", "lb_anna"].find((c) => query.has(c));
      const value = Number(query.get(col).replace(/^gt\./, ""));
      const n = onBoard.filter((r) => Number(r[col]) > value).length;
      return new Response(null, { status: 206, headers: { "content-range": `0-${Math.max(0, n - 1)}/${n}` } });
    }

    if (query.has("email")) {
      const email = decodeURIComponent(query.get("email").replace(/^eq\./, ""));
      const row = rows[email];
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    }

    // top-N read
    const order = String(query.get("order") || "");
    const col = order.startsWith("lb_anna") ? "lb_anna" : "lb_words";
    const limit = Number(query.get("limit") || 25);
    const sorted = [...onBoard].sort((a, b) => b[col] - a[col]).slice(0, limit)
      .map(({ lb_name, lb_words, lb_anna }) => ({ lb_name, lb_words, lb_anna }));
    return new Response(JSON.stringify(sorted), { status: 200 });
  };
  return { fetchImpl, calls };
}

function sampleRows() {
  return {
    "alice@example.com": { email: "alice@example.com", lb_name: null, lb_words: 12, lb_anna: 3 },
    "bob@example.com": { email: "bob@example.com", lb_name: "Bob", lb_words: 40, lb_anna: 1 },
    "cara@example.com": { email: "cara@example.com", lb_name: "Cara", lb_words: 5, lb_anna: 9 },
    "dan@example.com": { email: "dan@example.com", lb_name: "Dan", lb_words: 20, lb_anna: 0 },
  };
}

test("GET needs a session", async () => {
  const { fetchImpl } = fakeSupabase({ rows: sampleRows() });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status, body } = parse(await leaderboard.handler(req("GET", null)));
    assert.equal(status, 401);
    assert.equal(body.code, "unauthenticated");
  }));
});

test("GET: top lists by each counter (joined learners only), caller's own row with counters even before joining", async () => {
  const { fetchImpl } = fakeSupabase({ rows: sampleRows() });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status, body } = parse(await leaderboard.handler(req("GET", "good")));
    assert.equal(status, 200);
    assert.deepEqual(body.top.words.map((r) => r.name), ["Bob", "Dan", "Cara"]);
    assert.deepEqual(body.top.anna.map((r) => r.name), ["Cara", "Bob", "Dan"]);
    assert.deepEqual(body.top.words[0], { name: "Bob", words: 40, anna: 1 });
    assert.ok(!JSON.stringify(body.top).includes("@"), "no email ever leaves the function");
    assert.deepEqual(body.me, { joined: false, name: null, words: 12, anna: 3, rankWords: null, rankAnna: null });
    assert.equal(body.limits.minName, 2);
    assert.equal(body.limits.maxName, 24);
  }));
});

test("POST {name}: joins under the normalized name and reports rank; a taken name is a 409; a bad name a 400", async () => {
  const rows = sampleRows();
  const { fetchImpl, calls } = fakeSupabase({ rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    let r = parse(await leaderboard.handler(req("POST", "good", { name: "  Alice   W " })));
    assert.equal(r.status, 200);
    assert.equal(rows["alice@example.com"].lb_name, "Alice W");
    const patch = calls.find((c) => (c.init.method || "") === "PATCH");
    assert.deepEqual(JSON.parse(patch.init.body), { lb_name: "Alice W" }, "only the name is written — never the counters");
    assert.deepEqual(r.body.me, { joined: true, name: "Alice W", words: 12, anna: 3, rankWords: 3, rankAnna: 2 });

    r = parse(await leaderboard.handler(req("POST", "good", { name: "bob" })));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "name_taken");
    assert.equal(rows["alice@example.com"].lb_name, "Alice W", "a refused rename keeps the old name");

    r = parse(await leaderboard.handler(req("POST", "good", { name: "<script>" })));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "bad_name");

    r = parse(await leaderboard.handler(req("POST", "good", { name: "x" })));
    assert.equal(r.status, 400);

    r = parse(await leaderboard.handler(req("POST", "bad", { name: "Mallory" })));
    assert.equal(r.status, 401);
  }));
});

test("POST {leave:true}: clears the name, counters stay", async () => {
  const rows = sampleRows();
  rows["alice@example.com"].lb_name = "Alice";
  const { fetchImpl } = fakeSupabase({ rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status, body } = parse(await leaderboard.handler(req("POST", "good", { leave: true })));
    assert.equal(status, 200);
    assert.equal(rows["alice@example.com"].lb_name, null);
    assert.deepEqual(body.me, { joined: false, name: null, words: 12, anna: 3, rankWords: null, rankAnna: null });
  }));
});

test("before migrations/leaderboard.sql has run, the board answers a clear 503", async () => {
  const { fetchImpl } = fakeSupabase({ rows: sampleRows(), migrated: false });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status, body } = parse(await leaderboard.handler(req("GET", "good")));
    assert.equal(status, 503);
    assert.equal(body.code, "not_migrated");
  }));
});

test("other methods are 405; a missing key is 503", async () => {
  const { fetchImpl } = fakeSupabase({ rows: sampleRows() });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    assert.equal(parse(await leaderboard.handler(req("DELETE", "good"))).status, 405);
  }));
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_SECRET_KEY: undefined }, () => withFetch(fetchImpl, async () => {
    assert.equal(parse(await leaderboard.handler(req("GET", "good"))).status, 503);
  }));
});

// --- saveUser writes the counters -----------------------------------------

const blob = {
  runs: {
    uk: {
      releasedBundleIds: ["b1"],
      progress: {
        WATER: { level: 7, completed: true, provenance: "pack" },
        BOOK: { level: 7, completed: false, provenance: "pack" },
        TUTOR_KAVA: { level: 2, completed: false, provenance: "tutor" },
      },
      personalVocab: [{ word: "вікно" }],
      pendingAdmission: [],
    },
  },
};

test("saveUser stores the blob and both counters in ONE PATCH", async () => {
  const rows = sampleRows();
  const { fetchImpl, calls } = fakeSupabase({ rows });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status } = parse(await saveUser.handler(req("POST", "good", { user: blob })));
    assert.equal(status, 200);
    const patches = calls.filter((c) => (c.init.method || "") === "PATCH");
    assert.equal(patches.length, 1, "no extra round-trip for the board");
    const body = JSON.parse(patches[0].init.body);
    assert.deepEqual(body.data, blob);
    assert.equal(body.lb_words, 1);
    assert.equal(body.lb_anna, 2);
    assert.ok(Date.parse(body.lb_updated_at) > 0);
    assert.equal(rows["alice@example.com"].lb_words, 1);
  }));
});

test("saveUser still lands the blob when the lb_ columns don't exist yet", async () => {
  const rows = sampleRows();
  const { fetchImpl, calls } = fakeSupabase({ rows, migrated: false });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status } = parse(await saveUser.handler(req("POST", "good", { user: blob })));
    assert.equal(status, 200);
    const patches = calls.filter((c) => (c.init.method || "") === "PATCH");
    assert.equal(patches.length, 2);
    assert.deepEqual(Object.keys(JSON.parse(patches[1].init.body)), ["data"]);
    assert.deepEqual(rows["alice@example.com"].data, blob);
  }));
});

test("saveUser reports a genuine write failure as 500 (no silent fallback)", async () => {
  const { fetchImpl, calls } = fakeSupabase({ rows: sampleRows(), patchStatus: 500 });
  await withEnv(ENV, () => withFetch(fetchImpl, async () => {
    const { status } = parse(await saveUser.handler(req("POST", "good", { user: blob })));
    assert.equal(status, 500);
    assert.equal(calls.filter((c) => (c.init.method || "") === "PATCH").length, 1);
  }));
});
