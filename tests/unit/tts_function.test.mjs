// The TTS function's error contract — stable reason codes instead of raw
// stacks, so a failing audio backend NAMES its problem in both the client
// warning and the Netlify function log (the 2026-08 billing outage surfaced
// as an anonymous 500 nobody ever saw).

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler } = require("../../netlify/functions/tts.js");

const savedEnv = {};
beforeEach(() => {
  savedEnv.email = process.env.GOOGLE_CLIENT_EMAIL;
  savedEnv.key = process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_CLIENT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
});
afterEach(() => {
  if (savedEnv.email !== undefined) process.env.GOOGLE_CLIENT_EMAIL = savedEnv.email;
  if (savedEnv.key !== undefined) process.env.GOOGLE_PRIVATE_KEY = savedEnv.key;
});

const get = (params) => handler({ httpMethod: "GET", queryStringParameters: params });

test("tts: missing text / lang are 400 bad_request, not 500", async () => {
  let res = await get({ lang: "fi-FI" });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad_request");

  res = await get({ text: "hei" });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "bad_request");
});

test("tts: over-long text is 400", async () => {
  const res = await get({ text: "x".repeat(501), lang: "fi-FI" });
  assert.equal(res.statusCode, 400);
});

test("tts: missing credentials is 503 tts_unconfigured — a named state, never a TypeError", async () => {
  const res = await get({ text: "hei", lang: "fi-FI" });
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).error, "tts_unconfigured");
});

test("tts: invalid POST body is 400", async () => {
  const res = await handler({ httpMethod: "POST", body: "{not json" });
  assert.equal(res.statusCode, 400);
});

test("tts: unsupported method is 405", async () => {
  const res = await handler({ httpMethod: "DELETE" });
  assert.equal(res.statusCode, 405);
});
