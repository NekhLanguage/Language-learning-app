#!/usr/bin/env node
// fill-core-templates.js
// Merges authored per-language template data into sentence_templates.json.
// Data lives in scripts/_template_data/<lang>.json, keyed by template_id:
//   { "<template_id>": { "render": "...", "surface": {CID: "..."}?, "questions": { role: "prompt"? } } }
//
// Adds new language keys to render (all templates), surface[lang] (only where a
// surface block already exists), and questions[role].prompt[lang] (only where
// questions already exist). NEVER touches existing en/pt/ar values — enforced by
// a deep invariant check before writing.
//
// Run from repo root: node scripts/fill-core-templates.js [--check]

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const TPL_FILE   = path.join(ROOT, 'sentence_templates.json');
const DATA_DIR   = path.join(__dirname, '_template_data');
const CHECK_ONLY = process.argv.includes('--check');

// The 10 languages absent from the original file, plus pt/ar which the original
// only partially covered (render present on ~35/123 templates). The merge only
// fills ABSENT keys, so existing pt/ar values are preserved.
const NEW_LANGS = ['de', 'el', 'es', 'fr', 'it', 'ja', 'ko', 'no', 'tr', 'uk', 'zh', 'pt', 'ar'];

// Copula-less languages drop "to be"; BE has no surface form for them.
const COPULA_DROP_LANGS = new Set(['ar', 'uk']);
const COPULA_CONCEPTS = new Set(['BE']);

// ── Custom serializer matching this file's conventions ───────────────────────
// 2-space indent; arrays whose elements are all strings/numbers render inline;
// everything else multiline. Closely matches the existing layout so diffs stay
// focused on the added language keys.
function ser(value, indent) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allPrim = value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    if (allPrim) return '[' + value.map(v => JSON.stringify(v)).join(', ') + ']';
    const items = value.map(v => padIn + ser(v, indent + 1));
    return '[\n' + items.join(',\n') + '\n' + pad + ']';
  }
  // object
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  const items = keys.map(k => padIn + JSON.stringify(k) + ': ' + ser(value[k], indent + 1));
  return '{\n' + items.join(',\n') + '\n' + pad + '}';
}

// Deep check: every path/value present in `before` must be identical in `after`.
// (after may have ADDED keys; it may not change or drop existing ones.)
function assertOnlyAdditions(before, after, pathStr = '') {
  if (Array.isArray(before)) {
    if (!Array.isArray(after) || after.length !== before.length)
      throw new Error(`array changed at ${pathStr}`);
    before.forEach((v, i) => assertOnlyAdditions(v, after[i], `${pathStr}[${i}]`));
    return;
  }
  if (before && typeof before === 'object') {
    if (!after || typeof after !== 'object' || Array.isArray(after))
      throw new Error(`object→non-object at ${pathStr}`);
    for (const k of Object.keys(before))
      assertOnlyAdditions(before[k], after[k], `${pathStr}.${k}`);
    return;
  }
  if (before !== after) throw new Error(`value changed at ${pathStr}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
}

function main() {
  const raw = fs.readFileSync(TPL_FILE, 'utf8');
  const original = JSON.parse(raw);
  const templates = original.templates;

  // Abort if any template lacks render.en (data integrity precondition).
  const noRender = templates.filter(t => !t.render || !t.render.en).map(t => t.template_id);
  if (noRender.length) { console.error(`Templates missing render.en: ${noRender.join(', ')}`); process.exit(1); }

  // Load language data
  const data = {};
  for (const lang of NEW_LANGS) {
    const fp = path.join(DATA_DIR, `${lang}.json`);
    if (!fs.existsSync(fp)) { console.warn(`  (no data file yet: ${lang}.json)`); continue; }
    data[lang] = JSON.parse(fs.readFileSync(fp, 'utf8'));
  }

  // Validate coverage of loaded data before mutating
  let problems = 0;
  for (const lang of Object.keys(data)) {
    for (const t of templates) {
      const d = data[lang][t.template_id];
      if (!d || !d.render || !String(d.render).trim()) {
        console.error(`  ✗ ${lang}: missing render for ${t.template_id}`); problems++; continue;
      }
      if (t.surface && Object.keys(t.surface).length) {
        const needCids = Object.keys(t.surface.en || {})
          .filter(c => !(COPULA_CONCEPTS.has(c) && COPULA_DROP_LANGS.has(lang)));
        const got = d.surface || {};
        const miss = needCids.filter(c => !got[c] || !String(got[c]).trim());
        if (miss.length) { console.error(`  ✗ ${lang}: ${t.template_id} surface missing ${miss.join(',')}`); problems++; }
      }
      if (t.questions && Object.keys(t.questions).length) {
        for (const role of Object.keys(t.questions)) {
          const p = d.questions && d.questions[role];
          if (!p || !String(p).trim()) { console.error(`  ✗ ${lang}: ${t.template_id} q.${role} prompt missing`); problems++; }
        }
      }
    }
  }
  if (problems) { console.error(`\n${problems} problem(s) in data files — aborting.`); process.exit(1); }

  if (CHECK_ONLY) {
    const ready = Object.keys(data);
    console.log(`[check] data ready for: ${ready.join(', ') || '(none)'} — ${ready.length}/${NEW_LANGS.length} langs, 0 problems.`);
    return;
  }
  if (Object.keys(data).length === 0) { console.log('No data files present; nothing to do.'); return; }

  // Mutate a deep clone so we can invariant-check against original.
  const merged = JSON.parse(JSON.stringify(original));
  for (const t of merged.templates) {
    for (const lang of Object.keys(data)) {
      const d = data[lang][t.template_id];
      if (!t.render[lang]) t.render[lang] = d.render;
      if (t.surface && Object.keys(t.surface).length && d.surface && !t.surface[lang]) {
        t.surface[lang] = d.surface;
      }
      if (t.questions && Object.keys(t.questions).length && d.questions) {
        for (const role of Object.keys(t.questions)) {
          if (d.questions[role] && !t.questions[role].prompt[lang]) {
            t.questions[role].prompt[lang] = d.questions[role];
          }
        }
      }
    }
  }

  assertOnlyAdditions(original, merged); // throws if any existing value changed

  fs.writeFileSync(TPL_FILE, ser(merged, 0) + '\n');
  // Re-read to be sure it still parses
  JSON.parse(fs.readFileSync(TPL_FILE, 'utf8'));
  console.log(`✓ merged ${Object.keys(data).length} language(s) into sentence_templates.json (${templates.length} templates).`);
}

main();
