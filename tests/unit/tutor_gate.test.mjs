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
