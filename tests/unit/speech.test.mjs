// Unit tests for the speaking-practice adapter (speech.mjs) with fake
// SpeechRecognition implementations.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speechRecognitionAvailable, recognizeOnce, recognizeSpeech, speechErrorKind, compareSpoken } from "../../speech.mjs";

function fakeRoot(behavior) {
  return {
    SpeechRecognition: class {
      start() { behavior(this); }
      abort() {}
    },
  };
}

test("availability detection", () => {
  assert.equal(speechRecognitionAvailable({}), false);
  assert.equal(speechRecognitionAvailable(fakeRoot(() => {})), true);
  assert.equal(speechRecognitionAvailable({ webkitSpeechRecognition: class {} }), true);
});

test("resolves with the transcript on result", async () => {
  const root = fakeRoot((rec) =>
    setTimeout(() => rec.onresult({ results: [[{ transcript: "eu como comida" }]] }), 5)
  );
  assert.equal(await recognizeOnce({ lang: "pt-BR" }, root), "eu como comida");
});

test("resolves null on error and on silent end", async () => {
  const err = fakeRoot((rec) => setTimeout(() => rec.onerror(new Error("no-speech")), 5));
  assert.equal(await recognizeOnce({ lang: "pt-BR" }, err), null);

  const silent = fakeRoot((rec) => setTimeout(() => rec.onend(), 5));
  assert.equal(await recognizeOnce({ lang: "pt-BR" }, silent), null);
});

test("resolves null on timeout", async () => {
  const hang = fakeRoot(() => {});
  assert.equal(await recognizeOnce({ lang: "pt-BR", timeoutMs: 50 }, hang), null);
});

test("resolves null when the API is missing", async () => {
  assert.equal(await recognizeOnce({ lang: "pt-BR" }, {}), null);
});

test("compareSpoken marks matched and missed words", () => {
  assert.deepEqual(compareSpoken("Eu como comida.", "eu como comida"), [
    { word: "eu", heard: true },
    { word: "como", heard: true },
    { word: "comida", heard: true },
  ]);
  assert.deepEqual(compareSpoken("Eu como comida.", "eu bebo água"), [
    { word: "eu", heard: true },
    { word: "como", heard: false },
    { word: "comida", heard: false },
  ]);
  // Punctuation and case are ignored; empty transcript misses everything.
  assert.deepEqual(compareSpoken("Ich esse!", ""), [
    { word: "ich", heard: false },
    { word: "esse", heard: false },
  ]);
});

test("recognizeSpeech names why recognition failed", async () => {
  const errorRoot = (code) => fakeRoot((rec) => setTimeout(() => rec.onerror({ error: code }), 5));
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, errorRoot("not-allowed")), { error: "mic-blocked" });
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, errorRoot("no-speech")), { error: "no-speech" });
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, errorRoot("network")), { error: "failed" });
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, errorRoot("language-not-supported")), { error: "unsupported" });
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, {}), { error: "unsupported" });
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO", timeoutMs: 30 }, fakeRoot(() => {})), { error: "no-speech" });
  const silent = fakeRoot((rec) => setTimeout(() => rec.onend(), 5));
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, silent), { error: "no-speech" });
  const ok = fakeRoot((rec) => setTimeout(() => rec.onresult({ results: [[{ transcript: "jeg drikker vann" }]] }), 5));
  assert.deepEqual(await recognizeSpeech({ lang: "nb-NO" }, ok), { transcript: "jeg drikker vann" });
});

test("speechErrorKind maps every SpeechRecognition error code", () => {
  for (const code of ["not-allowed", "service-not-allowed", "audio-capture"]) assert.equal(speechErrorKind(code), "mic-blocked");
  for (const code of ["no-speech", "aborted"]) assert.equal(speechErrorKind(code), "no-speech");
  assert.equal(speechErrorKind("language-not-supported"), "unsupported");
  for (const code of ["network", "bad-grammar", undefined]) assert.equal(speechErrorKind(code), "failed");
});
