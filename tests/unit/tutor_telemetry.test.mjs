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
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async () => ({
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

const { handler } = require("../../netlify/functions/tutor.js");

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
  } finally {
    globalThis.fetch = realFetch;
  }
});
