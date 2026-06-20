#!/usr/bin/env node
// validate-templates.js
// Validates the shared core sentence_templates.json for full language coverage:
//   - every template has render[lang] for all 13 languages (from languages.js)
//   - any present surface[lang] / questions[role].prompt[lang] also covers all 13
//   - concept refs (concepts[], surface keys, question choices/answer) exist
// The per-pack sentence_templates_<pack>.json files are render-only and are
// reported as INFORMATIONAL (deferred work) — they do not fail the check.
// Run: node validation/validate-templates.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '..');

function loadLanguageCodes() {
  const raw = fs.readFileSync(path.join(ROOT, 'languages.js'), 'utf8');
  const codes = [];
  const re = /\{\s*code:\s*"([a-z]{2})"/g;
  let m;
  while ((m = re.exec(raw)) !== null) codes.push(m[1]);
  return codes;
}

// Build the full set of known concept_ids from every *.json with a concepts[].
function loadConceptIds() {
  const ids = new Set();
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.json'))) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { continue; }
    if (Array.isArray(data.concepts)) {
      for (const c of data.concepts) if (c.concept_id) ids.add(c.concept_id);
    }
  }
  return ids;
}

function nonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }

function validateCoreFile(file, langCodes, conceptIds) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const templates = data.templates || [];
  const errors = [];

  for (const t of templates) {
    const id = t.template_id || '(no id)';

    // render coverage
    for (const lang of langCodes) {
      if (!nonEmptyStr(t.render && t.render[lang])) errors.push(`${id}: render missing ${lang}`);
    }
    // concept refs
    for (const c of (t.concepts || [])) {
      if (!conceptIds.has(c)) errors.push(`${id}: unknown concept in concepts[]: ${c}`);
    }
    // surface coverage (only if it exists at all)
    if (t.surface && Object.keys(t.surface).length) {
      const refCids = Object.keys(t.surface.en || {});
      for (const c of refCids) if (!conceptIds.has(c)) errors.push(`${id}: surface refs unknown concept: ${c}`);
      for (const lang of langCodes) {
        const map = t.surface[lang];
        if (!map || typeof map !== 'object') { errors.push(`${id}: surface missing ${lang}`); continue; }
        for (const c of refCids) if (!nonEmptyStr(map[c])) errors.push(`${id}: surface.${lang} missing ${c}`);
      }
    }
    // questions coverage (only if it exists at all)
    if (t.questions && Object.keys(t.questions).length) {
      for (const role of Object.keys(t.questions)) {
        const q = t.questions[role];
        for (const c of (q.choices || [])) if (!conceptIds.has(c)) errors.push(`${id}: q.${role} choice unknown concept: ${c}`);
        if (q.answer && !conceptIds.has(q.answer)) errors.push(`${id}: q.${role} answer unknown concept: ${q.answer}`);
        for (const lang of langCodes) {
          if (!nonEmptyStr(q.prompt && q.prompt[lang])) errors.push(`${id}: q.${role}.prompt missing ${lang}`);
        }
      }
    }
  }
  return { count: templates.length, errors };
}

function reportPackTemplates(langCodes) {
  const files = fs.readdirSync(ROOT)
    .filter(f => /^sentence_templates_.+\.json$/.test(f)).sort();
  console.log('\nDeferred (pack templates, render-only — informational):');
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    const templates = data.templates || [];
    const langs = new Set();
    for (const t of templates) Object.keys(t.render || {}).forEach(l => langs.add(l));
    const covered = langCodes.filter(l => langs.has(l)).length;
    console.log(`  ${f.padEnd(34)} ${templates.length} templates · render langs ${covered}/${langCodes.length}`);
  }
}

function main() {
  console.log('=== validate-templates.js ===\n');
  const langCodes = loadLanguageCodes();
  const conceptIds = loadConceptIds();
  console.log(`Languages: ${langCodes.length} · known concepts: ${conceptIds.size}\n`);

  const { count, errors } = validateCoreFile('sentence_templates.json', langCodes, conceptIds);

  if (errors.length === 0) {
    console.log(`[sentence_templates.json] PASS — ${count} templates, all cover ${langCodes.length} languages.`);
  } else {
    console.log(`[sentence_templates.json] FAILED — ${count} templates, ${errors.length} error(s):`);
    for (const e of errors.slice(0, 40)) console.log(`   - ${e}`);
    if (errors.length > 40) console.log(`   … and ${errors.length - 40} more`);
  }

  reportPackTemplates(langCodes);

  if (errors.length) { console.log('\nRESULT: FAILED.\n'); process.exit(1); }
  console.log('\nRESULT: PASSED core template check.\n');
}

main();
