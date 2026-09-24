// Streaming chat function (Nekh 2026-09-21): the pre-stream answers are
// plain JSON with the classic function's status codes, and the shared
// conversation builder gates exactly as the classic handler did.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tutor = require("../../netlify/functions/tutor.js");
const { default: handler } = await import("../../netlify/functions/tutorStream.mjs");

function req(method, body, headers = {}) {
  return new Request("http://local/.netlify/functions/tutorStream", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

test("tutorStream: 405 on GET, 400 on bad JSON, 401 without a session token", async () => {
  assert.equal((await handler(req("GET"))).status, 405);
  assert.equal((await handler(req("POST", "{not json"))).status, 400);
  const res = await handler(req("POST", { messages: [{ role: "user", content: "hi" }] }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "unauthenticated");
});

test("buildConversation: 503 without the API key; otherwise normalised messages, steering and cached system blocks", async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, allow: process.env.TUTOR_ALLOWED_EMAILS };
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const out = await tutor.buildConversation({ email: "a@x.com" }, "chat");
    assert.equal(out.error.status, 503);
  } finally {
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
  }

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.TUTOR_ALLOWED_EMAILS = "*";
  const realFetch = globalThis.fetch;
  // hasAccess reads the learner's row: an active window.
  globalThis.fetch = async () => new Response(JSON.stringify([{ email: "a@x.com", access_until: "infinity" }]), { status: 200 });
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "pub";
  try {
    const out = await tutor.buildConversation({
      email: "a@x.com",
      targetLang: "Portuguese",
      supportLang: "English",
      messages: [{ role: "assistant", content: "Olá" }, { role: "user", content: "oi" }],
      preferences: { challenge: "push" },
    }, "chat");
    assert.equal(out.error, undefined);
    assert.equal(out.messages[0].role, "user"); // API needs a user turn first
    assert.match(out.messages.at(-1).content, /^oi/);
    assert.ok(out.messages.at(-1).content.length > 2, "steering trailer appended on chat");
    // History breakpoint: on the last assistant turn, never on a user turn
    // (the steering trailer would break the prefix there).
    const lastAssistant = out.messages.filter((m) => m.role === "assistant").at(-1);
    assert.deepEqual(lastAssistant.content, [{ type: "text", text: "Olá", cache_control: { type: "ephemeral" } }]);
    assert.ok(out.messages.every((m) => m.role !== "user" || typeof m.content === "string"));
    assert.equal(out.system.length, 2);
    assert.deepEqual(out.system[0].cache_control, { type: "ephemeral" });
    assert.match(out.system[1].text, /TARGET LANGUAGE: Portuguese/);

    const summary = await tutor.buildConversation({
      email: "a@x.com", targetLang: "Portuguese", supportLang: "English",
      messages: [{ role: "user", content: "oi" }],
    }, "summary");
    assert.equal(summary.messages.at(-1).content, "oi", "no steering trailer on the summary");
    assert.ok(summary.messages.every((m) => typeof m.content === "string"), "no assistant turn → no history marker");

    // Only the LAST assistant turn carries the marker.
    const long = await tutor.buildConversation({
      email: "a@x.com", targetLang: "Portuguese", supportLang: "English",
      messages: [
        { role: "user", content: "oi" }, { role: "assistant", content: "Olá!" },
        { role: "user", content: "tudo bem?" }, { role: "assistant", content: "Tudo." },
        { role: "user", content: "ótimo" },
      ],
    }, "chat");
    assert.equal(typeof long.messages[1].content, "string");
    assert.equal(long.messages[3].content[0].cache_control.type, "ephemeral");
  } finally {
    globalThis.fetch = realFetch;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.allow === undefined) delete process.env.TUTOR_ALLOWED_EMAILS; else process.env.TUTOR_ALLOWED_EMAILS = saved.allow;
  }
});
