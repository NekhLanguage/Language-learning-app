// Regression test for the End-session production outage (2026-08-16): the
// summary schema is sent RAW to the structured-outputs API
// (output_config.format.schema on messages.create), which supports only a
// subset of JSON Schema. Constraint keywords like maxItems are rejected with
// a 400 — the SDK's .parse() helpers strip them client-side, but the raw
// path does not — and the 400 surfaced to learners as "Couldn't save the
// session (Tutor request failed)" on every End-session attempt.
//
// This test walks SUMMARY_SCHEMA and fails on any keyword the raw
// structured-outputs path does not accept. Express size limits in field
// descriptions and enforce hard caps client-side instead
// (learner_facts.mjs, tutor_admission.mjs).

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SUMMARY_SCHEMA } = require("../../netlify/functions/tutor.js");

// JSON Schema keywords the structured-outputs API rejects when the schema is
// passed raw (per the Anthropic structured-outputs docs: no numeric, string,
// or array constraints, no schema composition beyond the supported subset).
const UNSUPPORTED_KEYWORDS = new Set([
  "minItems", "maxItems", "uniqueItems", "contains",
  "minLength", "maxLength", "pattern", "format",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minProperties", "maxProperties", "patternProperties", "propertyNames",
  "allOf", "oneOf", "not", "if", "then", "else",
  "dependencies", "dependentRequired", "dependentSchemas",
]);

// Keys whose VALUES are data, not schema keywords — don't descend into their
// string values, but do descend into schema-valued children.
function walk(node, path, offenders) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`, offenders));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) offenders.push(`${path}.${key}`);
    // "properties" maps field names to schemas; a field could legitimately be
    // NAMED like a keyword, so recurse into the values without flagging keys.
    if (key === "properties" && value && typeof value === "object") {
      for (const [prop, sub] of Object.entries(value)) {
        walk(sub, `${path}.properties.${prop}`, offenders);
      }
      continue;
    }
    if (value && typeof value === "object") walk(value, `${path}.${key}`, offenders);
  }
}

test("SUMMARY_SCHEMA uses only structured-outputs-supported keywords", () => {
  const offenders = [];
  walk(SUMMARY_SCHEMA, "SUMMARY_SCHEMA", offenders);
  assert.deepEqual(
    offenders,
    [],
    `Unsupported JSON Schema keywords found (these 400 the summary call in production):\n  ${offenders.join("\n  ")}`
  );
});

test("SUMMARY_SCHEMA still declares the fields the client consumes", () => {
  assert.equal(SUMMARY_SCHEMA.type, "object");
  for (const field of [
    "sessionSummary", "wins", "struggles", "newWords", "nextFocus",
    "newLearnerFacts", "correctedLearnerFacts",
  ]) {
    assert.ok(SUMMARY_SCHEMA.properties[field], `missing property: ${field}`);
    assert.ok(SUMMARY_SCHEMA.required.includes(field), `not required: ${field}`);
  }
});

test("newWords items declare exampleSentence + exampleTranslation as required strings", () => {
  const item = SUMMARY_SCHEMA.properties.newWords.items;
  for (const field of ["word", "translation", "note", "pos", "exampleSentence", "exampleTranslation"]) {
    assert.ok(item.properties[field], `newWords item missing property: ${field}`);
    assert.ok(item.required.includes(field), `newWords item not required: ${field}`);
  }
  assert.equal(item.properties.exampleSentence.type, "string");
  assert.equal(item.properties.exampleTranslation.type, "string");
  assert.equal(item.additionalProperties, false);
});
