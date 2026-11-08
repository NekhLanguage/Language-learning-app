import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEY,
  sanitiseSignupSource,
  sourceFromSearch,
  readStoredSignupSource,
  captureSignupSource,
} from "../../signup_source.mjs";

// A tiny localStorage-shaped stub: everything the module touches is
// getItem/setItem, so this covers it. `throwOn` lets a test force a
// storage failure (private window, cleared data, quota).
function makeStorage(seed = {}, opts = {}) {
  const data = { ...seed };
  const calls = { get: 0, set: 0 };
  return {
    data,
    calls,
    getItem(key) {
      calls.get += 1;
      if (opts.throwOn === "get") throw new Error("storage unavailable");
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      calls.set += 1;
      if (opts.throwOn === "set") throw new Error("storage unavailable");
      data[key] = String(value);
    },
  };
}

// --- sanitiser --------------------------------------------------------------

test("sanitiser accepts expected tag shapes", () => {
  for (const tag of ["yt-v24", "yt-v24b", "fb-blueprint", "fb_blueprint", "expo", "newsletter", "a", "0", "x".repeat(40)]) {
    assert.equal(sanitiseSignupSource(tag), tag, tag);
  }
});

test("sanitiser lowercases and trims before matching", () => {
  assert.equal(sanitiseSignupSource(" YT-V24 "), "yt-v24");
  assert.equal(sanitiseSignupSource("Expo"), "expo");
  assert.equal(sanitiseSignupSource("\tNEWSLETTER\n"), "newsletter");
});

test("sanitiser rejects invalid shapes", () => {
  const bad = [
    null,
    undefined,
    "",
    "   ",
    "x".repeat(41),                     // too long
    "yt v24",                           // space
    "yt.v24",                           // dot
    "yt/v24",                           // slash
    "yt+v24",                           // plus
    "yt@v24",                           // at
    "yt'v24",                           // quote (SQL-injection shape)
    "yt;drop",                          // semicolon
    "фб-грппа",                         // non-ASCII
    "<script>",                         // HTML
  ];
  for (const raw of bad) assert.equal(sanitiseSignupSource(raw), null, JSON.stringify(raw));
});

test("sourceFromSearch prefers ?source= over ?utm_source=", () => {
  assert.equal(sourceFromSearch("?source=yt-v24&utm_source=fb-blueprint"), "yt-v24");
});

test("sourceFromSearch falls back to utm_source when source is absent", () => {
  assert.equal(sourceFromSearch("?utm_source=newsletter"), "newsletter");
});

test("sourceFromSearch falls back to utm_source when source is invalid", () => {
  // A bare `?source=` or an unsanitisable value should not prevent the
  // utm_source fallback from winning.
  assert.equal(sourceFromSearch("?source=&utm_source=expo"), "expo");
  assert.equal(sourceFromSearch("?source=has%20space&utm_source=expo"), "expo");
});

test("sourceFromSearch returns null for empty or sourceless strings", () => {
  assert.equal(sourceFromSearch(""), null);
  assert.equal(sourceFromSearch(null), null);
  assert.equal(sourceFromSearch(undefined), null);
  assert.equal(sourceFromSearch("?start=free"), null);
});

// --- first-touch behaviour --------------------------------------------------

test("captureSignupSource writes on first touch when URL carries a source", () => {
  const storage = makeStorage();
  const out = captureSignupSource(storage, "?source=yt-v24");
  assert.equal(out, "yt-v24");
  assert.equal(storage.data[STORAGE_KEY], "yt-v24");
  assert.equal(storage.calls.set, 1);
});

test("captureSignupSource keeps the first-touch value on later URLs", () => {
  const storage = makeStorage({ [STORAGE_KEY]: "yt-v24" });
  const out = captureSignupSource(storage, "?source=fb-blueprint");
  assert.equal(out, "yt-v24", "first-touch wins");
  assert.equal(storage.data[STORAGE_KEY], "yt-v24");
  assert.equal(storage.calls.set, 0, "no overwrite of an existing tag");
});

test("captureSignupSource keeps the first-touch value on a sourceless URL", () => {
  const storage = makeStorage({ [STORAGE_KEY]: "expo" });
  const out = captureSignupSource(storage, "?start=free");
  assert.equal(out, "expo");
  assert.equal(storage.calls.set, 0);
});

test("captureSignupSource leaves storage untouched when URL has no usable source", () => {
  const storage = makeStorage();
  const out = captureSignupSource(storage, "?start=free");
  assert.equal(out, null);
  assert.equal(STORAGE_KEY in storage.data, false);
  assert.equal(storage.calls.set, 0);
});

test("captureSignupSource drops invalid stored values and captures a fresh valid one", () => {
  // A hand-written or tampered localStorage entry that no longer matches
  // the sanitiser should not block a legitimate first-touch capture.
  const storage = makeStorage({ [STORAGE_KEY]: "<script>" });
  const out = captureSignupSource(storage, "?source=newsletter");
  assert.equal(out, "newsletter");
  assert.equal(storage.data[STORAGE_KEY], "newsletter");
});

test("captureSignupSource returns null when storage reads throw", () => {
  const storage = makeStorage({}, { throwOn: "get" });
  const out = captureSignupSource(storage, "?source=yt-v24");
  assert.equal(out, null);
});

test("captureSignupSource returns null when storage writes throw", () => {
  const storage = makeStorage({}, { throwOn: "set" });
  const out = captureSignupSource(storage, "?source=yt-v24");
  assert.equal(out, null);
});

test("captureSignupSource returns null when storage is missing", () => {
  assert.equal(captureSignupSource(null, "?source=yt-v24"), null);
  assert.equal(captureSignupSource(undefined, "?source=yt-v24"), null);
});

// --- readStoredSignupSource -------------------------------------------------

test("readStoredSignupSource returns the stored first-touch value", () => {
  const storage = makeStorage({ [STORAGE_KEY]: "yt-v24" });
  assert.equal(readStoredSignupSource(storage), "yt-v24");
});

test("readStoredSignupSource returns null when nothing is stored", () => {
  assert.equal(readStoredSignupSource(makeStorage()), null);
});

test("readStoredSignupSource returns null when storage reads throw", () => {
  const storage = makeStorage({}, { throwOn: "get" });
  assert.equal(readStoredSignupSource(storage), null);
});

test("readStoredSignupSource re-sanitises on the way out", () => {
  // Defence in depth: a tampered localStorage entry is still filtered.
  const storage = makeStorage({ [STORAGE_KEY]: "YT V24" });
  assert.equal(readStoredSignupSource(storage), null);
});
