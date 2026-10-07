#!/usr/bin/env node
// validate-ui-strings.mjs — the UI-text guard (Nekh 2026-10-07: "go ahead
// with the CI guard").
//
// Every screen speaks the learner's support language through
// lang/<code>.json uiStrings, with English as the fallback. Two ways that
// shipped broken before this check existed:
//   - v1.2.97: keys used in code with no English text loaded → learners saw
//     «trialKeepGoing» on the paywall path (fixed in #213; the e2e
//     ui_fallback spec covers the loading side, this covers the data side).
//   - a translation that renames a {placeholder} renders the brace text
//     literally («Hallo {nme}»).
//
// HARD FAILS (never baselined):
//   1. A key used in UI code (ui / uiT / t / tr / uiStr / appText.t /
//      appText.ui / pluralText / data-i18n*) that en.json does not define.
//   2. A translation that uses a {placeholder} the English string does not
//      offer (plus the per-key extras below).
//
// RATCHETED via validation/ui-strings-baseline.json (--update-baseline):
//   3. A key en.json defines that a support language lacks.
//   4. A support-language value identical to the English one (a copied
//      fallback). Short / letterless / language-neutral values are exempt.
// New gaps fail; closed ones are listed as removable. The baseline is the
// reviewable translation debt per language (Angus drafts, Gazi lifts).
//
// Run: node validation/validate-ui-strings.mjs [--update-baseline]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const BASELINE_FILE = path.join(HERE, "ui-strings-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");

// Files whose UI text goes through uiStrings.
const CODE_FILES = ["app.js", "tutor.js", "leaderboard.mjs", "auth.mjs", "tutor_opinions.mjs", "auth.html"];
const MARKUP_FILES = ["index.html", "tutor.html", "auth.html"];

// Placeholders a translation may use although the English string does not
// (themePickRepeat: English uses the {nth} ordinal; other languages write
// "{n}." / "{n}e" from the bare count).
const EXTRA_VARS = { themePickRepeat: ["n"] };

// Values that are the same word in every language (or deliberately kept).
const NEUTRAL_KEYS = new Set([
  "betaBadge", "leaderboardColWords", "leaderboardColAnna", "tutorPageTitle",
  "emailPlaceholder", "blueprint",
]);

// Plural categories other than "other" are optional per language
// (Intl.PluralRules: ja has only "other", ru adds "few"/"many").
const OPTIONAL_PLURAL_RE = /_(zero|one|two|few|many)$/;

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const langCodes = fs.readdirSync(path.join(ROOT, "lang")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const ui = Object.fromEntries(langCodes.map((c) => [c, JSON.parse(read(`lang/${c}.json`)).uiStrings || {}]));
const en = ui.en;
const varsOf = (s) => new Set(String(s).match(/\{(\w+)\}/g)?.map((v) => v.slice(1, -1)) || []);

const hard = [];

// 1. Keys used in code / markup.
const used = new Map(); // key -> first file
const note = (key, file) => { if (!used.has(key)) used.set(key, file); };
const CALL_RE = /(?:^|[^\w.$])(?:ui|uiT|uiStr|tr|t|appText\.t|appText\.ui)\(\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g;
const PLURAL_RE = /pluralText\(\s*[\w.]+\s*,\s*[^,]+,\s*["']([A-Za-z][A-Za-z0-9_]*)["']/g;
for (const f of CODE_FILES) {
  const src = read(f);
  for (const m of src.matchAll(CALL_RE)) note(m[1], f);
  for (const m of src.matchAll(PLURAL_RE)) note(`${m[1]}_other`, f);
}
for (const f of MARKUP_FILES) {
  const src = read(f);
  for (const m of src.matchAll(/data-i18n(?:-placeholder|-aria-label|-title)?="([A-Za-z][A-Za-z0-9_]*)"/g)) note(m[1], f);
}
for (const [key, file] of used) {
  if (!(key in en)) hard.push(`KEY NOT IN en.json: "${key}" (used in ${file})`);
}

// 2. Placeholders.
for (const code of langCodes) {
  if (code === "en") continue;
  for (const [key, val] of Object.entries(ui[code])) {
    const base = key.replace(OPTIONAL_PLURAL_RE, "_other");
    const enVal = en[key] ?? en[base];
    if (typeof enVal !== "string" || typeof val !== "string") continue;
    const allowed = new Set([...varsOf(enVal), ...(EXTRA_VARS[key] || []), ...(OPTIONAL_PLURAL_RE.test(key) || key.endsWith("_other") ? ["n"] : [])]);
    for (const v of varsOf(val)) {
      if (!allowed.has(v)) hard.push(`UNKNOWN PLACEHOLDER [${code}] ${key}: {${v}} — English offers ${[...allowed].map((x) => `{${x}}`).join(" ") || "none"}`);
    }
  }
}

// 3 + 4. Translation debt.
const debt = { missing: {}, identical: {} };
for (const code of langCodes) {
  if (code === "en") continue;
  const missing = [];
  const identical = [];
  for (const [key, enVal] of Object.entries(en)) {
    if (OPTIONAL_PLURAL_RE.test(key)) continue;
    const val = ui[code][key];
    if (val === undefined) { missing.push(key); continue; }
    if (NEUTRAL_KEYS.has(key)) continue;
    if (typeof val === "string" && val.trim() === String(enVal).trim() && /[A-Za-z]{3,}/.test(enVal)) identical.push(key);
  }
  if (missing.length) debt.missing[code] = missing.sort();
  if (identical.length) debt.identical[code] = identical.sort();
}

const flat = (d) => new Set(Object.entries(d).flatMap(([kind, byLang]) => Object.entries(byLang).flatMap(([c, keys]) => keys.map((k) => `${kind}|${c}|${k}`))));
const found = flat(debt);

if (hard.length) {
  console.log("UI STRINGS — HARD FAILURES (never baselined):");
  for (const h of hard) console.log(`  ✗ ${h}`);
}

if (UPDATE) {
  if (hard.length) {
    console.log("\nFix the hard failures first; the baseline was not written.");
    process.exit(1);
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(debt, null, 2) + "\n");
  console.log(`Baseline written: ${found.size} entries (${Object.values(debt.missing).flat().length} missing, ${Object.values(debt.identical).flat().length} identical to English).`);
  process.exit(0);
}

let baseline = { missing: {}, identical: {} };
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")); } catch { /* first run */ }
const known = flat(baseline);
const fresh = [...found].filter((k) => !known.has(k));
const fixed = [...known].filter((k) => !found.has(k));

const perLang = {};
for (const k of found) { const c = k.split("|")[1]; perLang[c] = (perLang[c] || 0) + 1; }
console.log(`UI strings: ${used.size} keys used in code · ${Object.keys(en).length} in en.json · translation debt ${found.size} (baseline ${known.size}) · new: ${fresh.length} · fixed (removable): ${fixed.length}`);
if (Object.keys(perLang).length) console.log("Debt per language: " + Object.entries(perLang).map(([c, n]) => `${c} ${n}`).join(", "));

if (fresh.length) {
  console.log("\nNEW translation gaps (not in the baseline):");
  for (const k of fresh.slice(0, 60)) console.log(`  + ${k}`);
  if (fresh.length > 60) console.log(`  … and ${fresh.length - 60} more`);
  console.log("\nA new key needs its translations, or — when they follow in a later PR (Angus drafts) — an explicit `npm run validate:ui:update` so the debt is visible in the diff.");
}
if (fixed.length) console.log(`\n${fixed.length} baselined gaps are closed — prune with npm run validate:ui:update.`);

if (hard.length || fresh.length) {
  console.log("\nUI strings FAIL.");
  process.exit(1);
}
console.log("UI strings PASS.");
