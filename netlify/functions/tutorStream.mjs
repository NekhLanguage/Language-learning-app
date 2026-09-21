// Streaming chat with Anna (Nekh 2026-09-21). Same gates, same prompt, same
// telemetry as the classic `tutor` function's chat mode, but the reply is
// sent as it is generated so the learner watches the sentence form instead
// of waiting for the whole thing. Modern Netlify function (Request → Response
// with a ReadableStream body).
//
// Wire format: newline-delimited JSON, one object per line —
//   { "t": "…" }                 a piece of the reply text, in order
//   { "done": true }             the reply is complete
//   { "done": true, "refused": true }   the model declined (no reply)
//   { "error": "…" }             the call failed mid-way; the client discards
//                                what it has and treats the turn as failed
// Anything before the stream opens (auth, gates, bad input) is a plain JSON
// error response with the same status codes as the classic function, and the
// client falls back to that function when this one is unreachable.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tutor = require("./tutor.js");
const { verifySession } = require("./auth.js");

const MAX_TOKENS = 1024;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!body || typeof body !== "object") return json(400, { error: "Invalid JSON" });

  let session;
  try {
    session = await verifySession({ headers: { authorization: req.headers.get("authorization") || "" } });
  } catch (err) {
    console.error("tutorStream: session check failed:", err);
    return json(503, { error: "Sign-in check unavailable" });
  }
  if (!session) return json(401, { error: "Sign in required", code: "unauthenticated" });
  body.email = session.email;

  let built;
  try {
    built = await tutor.buildConversation(body, "chat");
  } catch (err) {
    console.error("tutorStream: build failed:", err);
    return json(500, { error: "Tutor request failed" });
  }
  if (built.error) return json(built.error.status, built.error.body);
  const { system, messages, targetLang, supportLang } = built;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const client = tutor.getClient();
        const run = client.messages.stream({
          model: tutor.MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages,
        });
        run.on("text", (delta) => { if (delta) send({ t: delta }); });
        const final = await run.finalMessage();
        // Fire-and-forget, as in the classic function.
        tutor.logTutorSession({
          user_email: String(body.email || "").toLowerCase().trim(),
          mode: "chat",
          model: tutor.MODEL,
          tokens_in: final.usage?.input_tokens || 0,
          tokens_out: final.usage?.output_tokens || 0,
          cache_read_tokens: final.usage?.cache_read_input_tokens || 0,
          cache_write_tokens: final.usage?.cache_creation_input_tokens || 0,
          cost_est_cents: tutor.costCents(tutor.MODEL, final.usage),
          session_len_sec: null,
          subject: "chat",
          target_lang: targetLang,
          support_lang: supportLang,
          turn_index: Math.floor(messages.length / 2),
        });
        if (final.stop_reason === "refusal") {
          console.warn("TUTOR REFUSAL (stream):", JSON.stringify(final.stop_details || null));
          send({ done: true, refused: true });
        } else {
          send({ done: true });
        }
      } catch (err) {
        console.error("TUTOR STREAM ERROR:", err);
        send({ error: "Tutor request failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
};
