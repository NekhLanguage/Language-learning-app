// Cost telemetry for the summary call (Nekh 2026-09-26): tutor_sessions had
// no `summary` rows on 09-24/09-26 although the summaries ran. The insert
// was fire-and-forget and the handler returned right after it, so Netlify
// froze the container before the row landed. The summary handler now
// awaits the insert (nobody waits on the summary — it runs in the
// background after End session). The chat path keeps fire-and-forget.
//
// The Anthropic SDK is replaced in the require cache before tutor.js loads,
// so no network and no API key are needed.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const summaryDoc = {
  sessionSummary: "s", wins: [], struggles: [], newWords: [], learnerWords: [], recycledWords: [],
  nextFocus: "", newLearnerFacts: [], correctedLearnerFacts: [],
};
const createCalls = [];
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (params) => (createCalls.push(params), {
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(summaryDoc) }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    };
  }
}
const sdkPath = require.resolve("@anthropic-ai/sdk");
require(sdkPath); // populate the cache entry, then swap its exports
require.cache[sdkPath].exports = FakeAnthropic;

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.TUTOR_ALLOWED_EMAILS = "*";
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "pub";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "sec";

const tutorFn = require("../../netlify/functions/tutor.js");
const { handler } = tutorFn;

test("the summary handler does not return until the tutor_sessions row has been sent", async () => {
  let insertStarted = false;
  let insertFinished = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ email: "a@x.com", id: "u1" }), { status: 200 });
    if (u.includes("/rest/v1/users")) return new Response(JSON.stringify([{ email: "a@x.com", access_until: "infinity" }]), { status: 200 });
    if (u.includes("/rest/v1/tutor_sessions")) {
      insertStarted = true;
      await new Promise((r) => setTimeout(r, 50)); // a slow Supabase
      insertFinished = true;
      return new Response("", { status: 201 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  try {
    const res = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer tok" },
      body: JSON.stringify({
        mode: "summary", targetLang: "Ukrainian", supportLang: "English",
        messages: [{ role: "user", content: "привіт" }, { role: "assistant", content: "Привіт!" }],
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).summary, summaryDoc);
    assert.equal(insertStarted, true, "telemetry row attempted");
    assert.equal(insertFinished, true, "handler waited for the telemetry insert to complete");
    // Sonnet 5.5 (Nekh 2026-09-29): the summary sends the model's own
    // "no thinking" spelling plus low effort, and the schema still rides.
    const params = createCalls.at(-1);
    assert.equal(params.model, "claude-sonnet-5-5");
    assert.deepEqual(params.thinking, { type: "between_tools" });
    assert.equal(params.output_config.effort, "low");
    assert.equal(params.output_config.format.type, "json_schema");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("summaryThinking spells 'no thinking' the way each model accepts it", () => {
  assert.deepEqual(tutorFn.summaryThinking("claude-sonnet-5-5"), { type: "between_tools" });
  assert.deepEqual(tutorFn.summaryThinking("claude-sonnet-5"), { type: "disabled" });
  assert.deepEqual(tutorFn.summaryThinking("claude-opus-4-8"), { type: "disabled" });
  assert.equal(tutorFn.summaryThinking("claude-opus-5-5"), null, "Opus 5.5 rejects both: adaptive at low effort");
  assert.equal(tutorFn.summaryThinking("claude-fable-5-1"), null);
});

test("the default chat model has a price row, so cost telemetry never lands at zero", () => {
  assert.equal(tutorFn.MODEL, "claude-sonnet-5-5");
  assert.ok(tutorFn.MODEL_PRICES_CENTS_PER_MTOK[tutorFn.MODEL], "price row for the default model");
  assert.equal(tutorFn.costCents(tutorFn.MODEL, { input_tokens: 1_000_000 }), 200);
  assert.deepEqual(tutorFn.CHAT_OUTPUT_CONFIG, { effort: "low" });
});
