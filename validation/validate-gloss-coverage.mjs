#!/usr/bin/env node
// validate-gloss-coverage.mjs
// The net for the "prompt asks for a word the tiles can't build" bug class:
// the L6/L7 prompt shows the authored render.en while tiles and expected
// answers are generated from the template's concepts. An authored English
// gloss containing a content word the generated English sentence lacks
// ("He has a HIGH level." over tiles [he, has, a level]) makes the exercise
// unanswerable in every target language.
//
// English-vs-English is the comparable pair: any authored render.en token
// (articles aside) missing from the engine's generated English sentence is
// a finding. Fixed-form structures pass vacuously because the engine
// returns the authored string for them.
//
// Findings that exist today live in validation/gloss-coverage-baseline.json
// and do not fail the run; any NEW finding fails (exit 1).
//
// Run:  node validation/validate-gloss-coverage.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import { configureEngine, buildSentence } from '../sentence_engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'gloss-coverage-baseline.json');
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

// Articles are supplied by the engine's own article machinery and never
// correspond to a tile of their own inside a noun phrase; everything else —
// including copulas and prepositions — must be buildable.
const TOLERATED = new Set(['a', 'an', 'the']);

const tokenize = (s) => String(s || '')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[.,!?;:"()«»¿¡…。！？]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const found = new Map(); // key -> { authored, generated, token }
let checked = 0;
for (const tpl of templates) {
  const authored = tpl.render?.en;
  if (typeof authored !== 'string' || !authored.trim()) continue;
  checked++;
  let generated;
  try { generated = buildSentence('en', tpl); } catch (e) { generated = `<threw: ${e.message}>`; }
  const have = new Set(tokenize(generated));
  for (const token of tokenize(authored)) {
    if (TOLERATED.has(token) || have.has(token)) continue;
    found.set(`${tpl._file}|${tpl.template_id}|${token}`, { authored, generated, token });
  }
}

console.log(`Gloss coverage: ${checked} templates with an authored en render · ${found.size} uncovered token(s)`);

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify([...found.keys()].sort(), null, 2) + '\n');
  console.log(`Baseline updated: ${found.size} finding(s) written to ${path.relative(process.cwd(), BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }
const known = new Set(baseline);

const fresh = [...found.keys()].filter((k) => !known.has(k));
const fixed = baseline.filter((k) => !found.has(k));

console.log(`Baseline: ${known.size} known · new: ${fresh.length} · fixed (removable): ${fixed.length}`);

if (fresh.length) {
  console.error('\nNEW uncovered gloss words — the English prompt promises a word the');
  console.error('generated sentence (and therefore the L6 tiles / L7 answer) cannot');
  console.error('express. Add the concept, a surface override, or reword render.en;');
  console.error('baseline only deliberately with:  npm run validate:gloss:update\n');
  for (const k of fresh.slice(0, 25)) {
    const { authored, generated, token } = found.get(k);
    console.error(`  ${k}\n     missing  : "${token}"\n     authored : ${authored}\n     generated: ${generated}`);
  }
  if (fresh.length > 25) console.error(`  … and ${fresh.length - 25} more`);
  process.exit(1);
}

if (fixed.length) {
  console.log('Some baselined findings are now fixed — run `npm run validate:gloss:update` to prune them.');
}
console.log('No new uncovered gloss words. PASS.');
