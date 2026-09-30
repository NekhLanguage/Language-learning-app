// Anna's gate (Nekh 2026-09-16): the subscription window is the only gate;
// TUTOR_ALLOWED_EMAILS is an optional test-time restriction, off by default.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function withAllowlist(value, fn) {
  const saved = process.env.TUTOR_ALLOWED_EMAILS;
  if (value === undefined) delete process.env.TUTOR_ALLOWED_EMAILS;
  else process.env.TUTOR_ALLOWED_EMAILS = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TUTOR_ALLOWED_EMAILS;
    else process.env.TUTOR_ALLOWED_EMAILS = saved;
  }
}

const { tutorEnabled } = require("../../netlify/functions/tutor.js");

test("no allowlist means Anna is open (the subscription window gates instead)", () => {
  withAllowlist(undefined, () => assert.equal(tutorEnabled("anyone@example.com"), true));
  withAllowlist("", () => assert.equal(tutorEnabled("anyone@example.com"), true));
  withAllowlist("  ,  ", () => assert.equal(tutorEnabled("anyone@example.com"), true));
  withAllowlist("*", () => assert.equal(tutorEnabled("anyone@example.com"), true));
});

test("an explicit allowlist still restricts, case-insensitively", () => {
  withAllowlist("Emi@Test.com, nekhbrazil@gmail.com", () => {
    assert.equal(tutorEnabled("emi@test.com"), true);
    assert.equal(tutorEnabled("NEKHBRAZIL@gmail.com"), true);
    assert.equal(tutorEnabled("stranger@example.com"), false);
    assert.equal(tutorEnabled(""), false);
  });
});

// Free tier (Nekh 2026-09-30): Anna is fully paywalled and the gate is
// server-side. A free-tier row is refused even if its access_until were
// set to 'infinity' — the exact devtools attack the lock-down closes.
test("a free-tier account never reaches Anna, whatever its window says", async () => {
  const tutor = require("../../netlify/functions/tutor.js");
  const rows = {
    "tina@example.com": { email: "tina@example.com", access_until: "infinity", access_tier: "trial" },
    "paula@example.com": { email: "paula@example.com", access_until: "infinity", access_tier: "paid" },
    "old@example.com": { email: "old@example.com", access_until: "infinity", access_tier: null },
  };
  const tokens = { tina: "tina@example.com", paula: "paula@example.com", old: "old@example.com" };
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.SUPABASE_PUBLISHABLE_KEY = "pub";
  process.env.SUPABASE_SECRET_KEY = "sec";
  delete process.env.TUTOR_ALLOWED_EMAILS;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/auth/v1/user")) {
      const email = tokens[String(init.headers.Authorization).replace("Bearer ", "")];
      return email ? new Response(JSON.stringify({ id: email, email }), { status: 200 }) : new Response("{}", { status: 401 });
    }
    if (u.includes("/rest/v1/users")) {
      const email = decodeURIComponent(/email=eq\.([^&]+)/.exec(u)[1]);
      return new Response(JSON.stringify(rows[email] ? [rows[email]] : []), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const ping = async (token) => JSON.parse((await tutor.handler({
      httpMethod: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "ping", email: "paula@example.com" }),
    })).body).allowed;
    assert.equal(await ping("tina"), false, "trial refused even with an infinite window and a body email of a payer");
    assert.equal(await ping("paula"), true);
    assert.equal(await ping("old"), true, "pre-free-tier rows (tier NULL) are unchanged");
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
