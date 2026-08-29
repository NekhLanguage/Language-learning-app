// Audio fallback contract — born from the 2026-08 TTS outage: Google Cloud
// billing was disabled, every cloud request failed, and every learner
// silently heard their browser's default (American) voice because the
// fallback path both swallowed errors and matched voices fuzzily. These
// tests pin the two behaviours that make that impossible to repeat:
// voice picking never lands on a wrong-language voice, and the fallback
// telemetry the app exposes starts clean.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBrowserVoice, getAudioFallbacks, setVoiceMap } from "../../audioengine.js";

const VOICES = [
  { name: "US English", lang: "en-US" },
  { name: "UK English", lang: "en-GB" },
  { name: "Google français", lang: "fr-FR" },
  { name: "Norsk (system)", lang: "nb-NO" },
];

test("pickBrowserVoice: exact BCP-47 match wins", () => {
  assert.equal(pickBrowserVoice(VOICES, "fr-FR").name, "Google français");
  assert.equal(pickBrowserVoice(VOICES, "nb-NO").name, "Norsk (system)");
});

test("pickBrowserVoice: primary-subtag match when the region differs", () => {
  // A device with only en-US still serves an en-GB request and vice versa.
  assert.equal(pickBrowserVoice(VOICES, "en-AU").lang, "en-US");
  // Case-insensitive.
  assert.equal(pickBrowserVoice(VOICES, "FR-fr").name, "Google français");
});

test("pickBrowserVoice: NO voice for the language means null — never the default English voice", () => {
  // The outage face: Finnish text must not come back with an American voice.
  assert.equal(pickBrowserVoice(VOICES, "fi-FI"), null);
  assert.equal(pickBrowserVoice(VOICES, "uk-UA"), null);
  // The old fuzzy `.includes()` walk would have matched "nb-NO" for a bare
  // "no" — the primary-subtag compare still allows that legitimate match…
  assert.equal(pickBrowserVoice(VOICES, "nb").lang, "nb-NO");
  // …but never a cross-language one.
  assert.equal(pickBrowserVoice(VOICES, ""), null);
  assert.equal(pickBrowserVoice([], "fr-FR"), null);
});

test("audio fallback telemetry starts clean and is a copy", () => {
  setVoiceMap({ fi: "fi-FI" });
  const stats = getAudioFallbacks();
  assert.deepEqual(stats, { count: 0, skipped: 0, last: null });
  stats.count = 99; // mutating the copy must not touch the module state
  assert.equal(getAudioFallbacks().count, 0);
});
