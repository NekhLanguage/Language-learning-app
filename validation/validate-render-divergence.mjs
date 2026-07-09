#!/usr/bin/env node
// validate-render-divergence.mjs
// The regression ratchet for TARGET-language grammar quality. Runs the real
// sentence engine over every template × language that has a human-authored
// render string and records where the generated sentence differs from it.
// Divergences that exist today live in validation/render-divergence-baseline
// .json and do not fail the run; any NEW divergence fails (exit 1).
//
// This is the net for the bug class behind the Ukrainian case fixes («Я п'ю
// вода» shipping while the authored render said «Я п'ю воду»): the authored
// renders are the native-speaker ground truth, and the engine drifting away
// from them — or a new language landing with a high divergence rate nobody
// looked at — should be a visible, deliberate decision, not an accident.
//
// When adding a NEW LANGUAGE: author render strings for the core templates
// first, run `npm run validate:divergence` to see exactly which grammar the
// engine gets wrong for it, fix what's fixable (engine rules or data), and
// only then baseline the remainder with --update-baseline. The baseline diff
// in the PR is the reviewable list of known-broken sentences learners will
// see for that language.
//
// Run:  node validation/validate-render-divergence.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import { configureEngine, buildSentence } from '../sentence_engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'render-divergence-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();

// Deterministic config, mirroring validate-sentences.mjs: everything
// released, rng high enough to suppress random modifier injection.
configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  rng: () => 0.999,
});

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const found = new Map(); // key -> { authored, generated }
const perLang = {};
for (const tpl of templates) {
  for (const lc of langCodes) {
    const authored = tpl.render?.[lc];
    if (typeof authored !== 'string' || !authored.trim()) continue;
    perLang[lc] ??= { total: 0, diverged: 0 };
    perLang[lc].total++;
    let generated;
    try { generated = buildSentence(lc, tpl); } catch (e) { generated = `<threw: ${e.message}>`; }
    if (norm(generated) !== norm(authored)) {
      perLang[lc].diverged++;
      found.set(`${tpl._file}|${tpl.template_id}|${lc}`, { authored, generated });
    }
  }
}

console.log('lang  authored  diverged  rate');
for (const [lc, d] of Object.entries(perLang)) {
  const rate = ((d.diverged / d.total) * 100).toFixed(0).padStart(3);
  console.log(`${lc.padEnd(5)} ${String(d.total).padStart(8)}  ${String(d.diverged).padStart(8)}  ${rate}%`);
}

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify([...found.keys()].sort(), null, 2) + '\n');
  console.log(`\nBaseline updated: ${found.size} divergence(s) written to ${path.relative(process.cwd(), BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }
const known = new Set(baseline);

const fresh = [...found.keys()].filter((k) => !known.has(k));
const fixed = baseline.filter((k) => !found.has(k));

console.log(`\nDivergences: ${found.size} · baseline: ${known.size} · new: ${fresh.length} · fixed (removable): ${fixed.length}`);

if (fresh.length) {
  console.error('\nNEW divergences from the authored renders — the engine now generates');
  console.error('something a native speaker did not write. Fix the engine/data, or');
  console.error('baseline them deliberately with:  npm run validate:divergence:update\n');
  for (const k of fresh.slice(0, 25)) {
    const { authored, generated } = found.get(k);
    console.error(`  ${k}\n     authored : ${authored}\n     generated: ${generated}`);
  }
  if (fresh.length > 25) console.error(`  … and ${fresh.length - 25} more`);
  process.exit(1);
}

if (fixed.length) {
  console.log('Some baselined divergences are now fixed — run `npm run validate:divergence:update` to prune them.');
}
console.log('No new divergences. PASS.');
