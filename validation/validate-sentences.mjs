#!/usr/bin/env node
// validate-sentences.mjs
// Runs the REAL sentence generator (sentence_engine.js) over every template ×
// every language and flags broken support-language sentences BEFORE a learner
// can encounter them. This is the automated net for the class of bugs reported
// from the uk/en exercises ("we go a nice gym", "a red phone is in that",
// "we use a right potion") and the equivalents in every other language pair.
//
// Checks:
//   1. MISSING_WORD  — English render contains a structural function word
//                      (to/into/onto/of/for) that the generator drops, e.g.
//                      "go to a gym" rendered as "go a gym".
//   2. EN_GRAMMAR    — English generator output trips a grammar lint:
//                      dangling demonstrative ("in that"), doubled article,
//                      a/an mismatch, leaked CONCEPT_ID, double space,
//                      lowercase start, missing terminal punctuation.
//   3. LEAK / EMPTY  — In ANY language, the generated sentence is empty or
//                      contains an untranslated CONCEPT_ID token (missing form).
//   4. ADJ_NO_NOUN   — A restrictive adjective (one with a semantic-role
//                      allowlist, e.g. RIGHT -> body parts) has NO template
//                      whose noun it suits, so it would be forced onto an
//                      incompatible noun ("a right potion").
//
// Regression-gating via a baseline: pre-existing findings live in
// validation/sentence-baseline.json and do NOT fail the run; only NEW findings
// fail (exit 1). Refresh the baseline intentionally with --update-baseline.
//
// Run:  node validation/validate-sentences.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import {
  configureEngine, buildSentence, ADJECTIVE_ROLE_COMPAT, adjectiveSuitsNoun,
} from '../sentence_engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BASELINE_FILE = path.join(HERE, 'sentence-baseline.json');

const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();
const conceptIds = new Set(Object.keys(vocab.concepts));

// Configure the engine deterministically: everything "released", no random
// modifier injection (rng >= 0.75 suppresses the adjective/number paths), so a
// template renders its plain base sentence reproducibly.
configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  rng: () => 0.999,
});

const findings = [];
const add = (file, id, type, detail, sample) =>
  findings.push({ key: `${file}|${id}|${type}|${detail}`, file, id, type, detail, sample });

// ---- token helpers ---------------------------------------------------------
const tokens = (s) => String(s || '').toLowerCase().replace(/[.?!,]/g, '').split(/\s+/).filter(Boolean);
const STRUCT_PREPS = new Set(['to', 'into', 'onto', 'of', 'for']);

// ---- per-template checks ---------------------------------------------------
for (const t of templates) {
  const id = t.template_id || '(no id)';
  const file = t._file;

  // 1 + 2: English-focused checks (en is the lingua-franca support language).
  let en = '';
  try { en = buildSentence('en', t); } catch (e) { add(file, id, 'EN_GRAMMAR', 'threw: ' + e.message); }

  if (en) {
    // 1. structural function word present in render.en but dropped by generator
    const renderEn = t.render && t.render.en;
    if (renderEn) {
      const gen = new Set(tokens(en));
      for (const w of tokens(renderEn)) {
        if (STRUCT_PREPS.has(w) && !gen.has(w)) add(file, id, 'MISSING_WORD', w, `gen="${en}" render="${renderEn}"`);
      }
    }
    // 2. English grammar lints on what the learner actually sees
    if (/\b(in|on|at|off|under|over|into|onto)\s+(that|this|these|those)\b(?!\s+one)/i.test(en))
      add(file, id, 'EN_GRAMMAR', 'dangling demonstrative', en);
    if (/\b(a|an|the)\s+(a|an|the)\b/i.test(en))
      add(file, id, 'EN_GRAMMAR', 'doubled article', en);
    if (/ {2,}/.test(en)) add(file, id, 'EN_GRAMMAR', 'double space', en);
    if (en && en[0] === en[0].toLowerCase() && en[0] !== en[0].toUpperCase())
      add(file, id, 'EN_GRAMMAR', 'lowercase start', en);
    if (!/[.?!]$/.test(en)) add(file, id, 'EN_GRAMMAR', 'no terminal punctuation', en);
  }

  // 3. LEAK / EMPTY across every language (covers all support pairs, not just en)
  for (const lc of langCodes) {
    let s = '';
    try { s = buildSentence(lc, t); } catch (e) { add(file, id, 'LEAK', `${lc} threw: ${e.message}`); continue; }
    if (!s || !s.replace(/[.?!]/g, '').trim()) { add(file, id, 'EMPTY', lc, s); continue; }
    // A genuine leak is an ALL-CAPS concept id surfacing because the language
    // has no form for it (formOf falls back to the id). Legit acronym forms
    // (e.g. NPC -> "NPC") are excluded by checking the form is actually absent.
    const raw = String(s).replace(/[.?!,]/g, '').split(/\s+/).filter(Boolean);
    const leaked = raw.find(w => /^[A-Z][A-Z0-9_]+$/.test(w) && conceptIds.has(w) && !vocab.languages[lc]?.forms?.[w]);
    if (leaked) add(file, id, 'LEAK', `${lc}:${leaked}`, s);
  }
}

// ---- 4. restrictive adjective with no compatible noun template -------------
const nounConcepts = templates.flatMap(t => (t.concepts || [])
  .filter(c => vocab.concepts[c]?.type === 'noun'));
for (const [cid, meta] of Object.entries(vocab.concepts)) {
  if (meta.type !== 'adjective') continue;
  if (!ADJECTIVE_ROLE_COMPAT[meta.semantic_role]) continue; // only restrictive roles
  const hasCompatTemplate = templates.some(t =>
    (t.concepts || []).some(c => vocab.concepts[c]?.type === 'noun' && adjectiveSuitsNoun(cid, c)));
  if (!hasCompatTemplate)
    add('(lexicon)', cid, 'ADJ_NO_NOUN', `${meta.semantic_role} adjective has no suitable noun template`);
}

// ---- baseline diff + report ------------------------------------------------
findings.sort((a, b) => a.key.localeCompare(b.key));
const keys = findings.map(f => f.key);

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(keys, null, 2) + '\n');
  console.log(`Baseline updated: ${keys.length} known finding(s) written to ${path.relative(ROOT, BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* none yet */ }
const baselineSet = new Set(baseline);

const fresh = findings.filter(f => !baselineSet.has(f.key));
const stillBaselined = keys.filter(k => baselineSet.has(k));
const goneFromBaseline = baseline.filter(k => !keys.includes(k));

console.log('=== validate-sentences.mjs ===\n');
console.log(`Templates: ${templates.length} · languages: ${langCodes.length} · total findings: ${findings.length}`);
console.log(`Baseline: ${baseline.length} known · ${stillBaselined.length} still present · ${goneFromBaseline.length} fixed (removable)\n`);

const byType = {};
for (const f of fresh) (byType[f.type] ??= []).push(f);

if (fresh.length === 0) {
  console.log(`No NEW findings beyond the baseline. PASS.`);
  if (goneFromBaseline.length) {
    console.log(`\nNote: ${goneFromBaseline.length} baselined finding(s) are now fixed — run --update-baseline to prune them.`);
  }
  process.exit(0);
}

console.log(`NEW findings (${fresh.length}) — these fail the check:\n`);
for (const type of Object.keys(byType).sort()) {
  console.log(`  [${type}] ${byType[type].length}`);
  for (const f of byType[type].slice(0, 25)) {
    console.log(`    - ${f.file} ${f.id}: ${f.detail}${f.sample ? `  «${f.sample}»` : ''}`);
  }
  if (byType[type].length > 25) console.log(`    … and ${byType[type].length - 25} more`);
}
console.log(`\nRESULT: FAILED — ${fresh.length} new finding(s). Fix them, or (if intentional) run:`);
console.log(`  node validation/validate-sentences.mjs --update-baseline\n`);
process.exit(1);
