// Supabase key hygiene (Nekh 2026-09-15): every Netlify function builds its
// Supabase headers from SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY, and
// no key literal lives in the repo — so the legacy JWT keys can be disabled.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const FUNCTIONS_DIR = path.join(ROOT, "netlify", "functions");

const supabase = require("../../netlify/functions/supabase.js");

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("no function, script or migration carries a Supabase JWT literal", () => {
  const dirs = [FUNCTIONS_DIR, path.join(ROOT, "scripts"), path.join(ROOT, "migrations")];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (!fs.statSync(file).isFile()) continue;
      const text = fs.readFileSync(file, "utf8");
      assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(text), `${name} contains a JWT literal`);
      assert.ok(!/sb_(publishable|secret)_[A-Za-z0-9]/.test(text), `${name} contains a Supabase key literal`);
      assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY/.test(text),
        `${name} still reads a legacy key env var`);
    }
  }
});

test("every function that talks to Supabase goes through supabase.js", () => {
  for (const name of fs.readdirSync(FUNCTIONS_DIR)) {
    if (!name.endsWith(".js") || name === "supabase.js") continue;
    const text = fs.readFileSync(path.join(FUNCTIONS_DIR, name), "utf8");
    if (!/supabase\.co|rest\/v1\//.test(text) && !/require\("\.\/supabase"\)/.test(text)) continue;
    assert.ok(/require\("\.\/supabase"\)/.test(text), `${name} must require ./supabase`);
    assert.ok(!/supabase\.co/.test(text), `${name} must not carry its own Supabase URL`);
    assert.ok(!/"apikey":|apikey: (?!key|writeKey|readKey|serviceKey)/.test(text),
      `${name} must build headers with restHeaders()`);
  }
});

test("keys come from the environment only; trimmed; null when unset", () => {
  withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_SECRET_KEY: undefined }, () => {
    assert.equal(supabase.publishableKey(), null);
    assert.equal(supabase.secretKey(), null);
  });
  withEnv({ SUPABASE_PUBLISHABLE_KEY: "  pub-test-value  ", SUPABASE_SECRET_KEY: "" }, () => {
    assert.equal(supabase.publishableKey(), "pub-test-value");
    assert.equal(supabase.secretKey(), null);
  });
  const h = supabase.restHeaders("k1", { Prefer: "return=minimal" });
  assert.deepEqual(h, { apikey: "k1", Authorization: "Bearer k1", Prefer: "return=minimal" });
  assert.match(supabase.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
});

test("with the publishable key unset the learner-facing functions 503 loudly instead of falling back", async () => {
  await withEnv({ SUPABASE_PUBLISHABLE_KEY: undefined }, async () => {
    const checkAccess = require("../../netlify/functions/checkAccess.js");
    const loadUser = require("../../netlify/functions/loadUser.js");
    const saveUser = require("../../netlify/functions/saveUser.js");
    const beacon = require("../../netlify/functions/beacon.js");
    const body = JSON.stringify({ email: "x@example.com", user: { runs: {} } });
    const r1 = await checkAccess.handler({ body, headers: {} });
    assert.equal(r1.statusCode, 503);
    assert.equal(JSON.parse(r1.body).allowed, false);
    const r2 = await loadUser.handler({ body, headers: {} });
    assert.equal(r2.statusCode, 503);
    const r3 = await saveUser.handler({ body, headers: {} });
    assert.equal(r3.statusCode, 503);
    // The beacon never breaks the app: it logs and still 204s.
    const r4 = await beacon.handler({ httpMethod: "POST", body: JSON.stringify({ type: "session_start", payload: {} }), headers: {} });
    assert.equal(r4.statusCode, 204);
  });
});

test("the admin events read requires the secret key rather than reading on the publishable one", async () => {
  await withEnv({ ADMIN_TOKEN: "t", SUPABASE_SECRET_KEY: undefined, SUPABASE_PUBLISHABLE_KEY: "pub-test-value" }, async () => {
    const getEvents = require("../../netlify/functions/getEvents.js");
    const r = await getEvents.handler({ queryStringParameters: { token: "t" }, headers: {} });
    assert.equal(r.statusCode, 503);
    assert.match(JSON.parse(r.body).error, /SUPABASE_SECRET_KEY/);
  });
});
