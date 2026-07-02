// Unit tests for the speaking-practice adapter (speech.mjs) with fake
// SpeechRecognition implementations.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speechRecognitionAvailable, recognizeOnce, compareSpoken } from "../../speech.mjs";

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
