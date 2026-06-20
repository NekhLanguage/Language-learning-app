#!/usr/bin/env node
// validate-packs.js
// Checks every resource-pack file (those with both a `concepts` array and a
// `languages` map) provides a valid, non-empty translation for every concept
// in EVERY supported language from languages.js. Verbs must have a base form
// (plus a full present-tense paradigm in person-marking languages, and a
// 3_singular in English); countable nouns in gender-required languages must
// carry a gender field.
// Run: node validation/validate-packs.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '..');

// Languages where countable nouns should carry a gender field.
// Mirrors validate-structure.js, plus French which is also gendered.
const GENDER_REQUIRED_LANGS = new Set(['de', 'pt', 'ar', 'fr', 'es']);

// Languages whose present-tense verbs inflect by person/number. The grammar
// engine (getVerbForm in app.js) reads a `${person}_${number}` key for these;
// without it the sentence falls back to the infinitive (e.g. uk «чаклувати»
// instead of «чаклує»). Require the full present paradigm for these.
// en needs only base + 3_singular; no uses a uniform `present`/base; and
// ja/ko/zh do not inflect verbs by person, so base alone is correct.
const VERB_PERSON_LANGS = new Set(['es', 'fr', 'de', 'pt', 'uk', 'ar', 'el', 'tr']);
const PERSON_PARADIGM_KEYS = ['1_singular', '2_singular', '3_singular', '1_plural', '2_plural', '3_plural'];

// ─── Canonical language list (sourced from languages.js) ─────────────────────

function loadLanguageCodes() {
  const raw = fs.readFileSync(path.join(ROOT, 'languages.js'), 'utf8');
  const codes = [];
  const re = /\{\s*code:\s*"([a-z]{2})"/g;
  let m;
  while ((m = re.exec(raw)) !== null) codes.push(m[1]);
  if (codes.length === 0) throw new Error('Could not parse language codes from languages.js');
  return codes;
}

// ─── Pack discovery ──────────────────────────────────────────────────────────

// A "pack" is any top-level *.json with both a concepts[] and a languages{} map.
function discoverPacks() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.json'))
    .filter(f => {
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
      catch (e) { return false; }
      return data && Array.isArray(data.concepts) && data.languages && typeof data.languages === 'object';
    })
    .sort();
}

// ─── Helpers (shared shape with validate-structure.js) ───────────────────────

function primaryValue(entry) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (Array.isArray(entry))  return (entry[0] || '').trim() || null;
  if (typeof entry === 'object') {
    const val = (entry.form || entry.base || '').trim();
    return val || null;
  }
  return null;
}

// ─── Per-pack validation ─────────────────────────────────────────────────────

function validatePack(data, langCodes) {
  const concepts = data.concepts || [];
  const languages = data.languages || {};
  const results = {}; // lang -> { errors:[], warnings:[] }

  for (const lang of langCodes) {
    const errors = [];
    const warnings = [];
    const langBlock = languages[lang];

    if (!langBlock || typeof langBlock !== 'object' || !langBlock.forms) {
      errors.push(`MISSING LANGUAGE BLOCK: ${lang}`);
      results[lang] = { errors, warnings };
      continue;
    }

    const forms = langBlock.forms;

    for (const concept of concepts) {
      const cid = concept.concept_id;
      if (!cid) continue;
      const entry = forms[cid];

      // Missing entirely
      if (entry === undefined || entry === null) {
        errors.push(`MISSING: ${cid}`);
        continue;
      }
      // Empty / blank
      const primary = primaryValue(entry);
      if (!primary) {
        errors.push(`EMPTY VALUE: ${cid}`);
        continue;
      }
      // Verb must have a base form, plus a complete present paradigm in
      // person-marking languages (and 3_singular in English).
      if (concept.type === 'verb') {
        if (typeof entry !== 'object' || Array.isArray(entry) || !entry.base) {
          errors.push(`VERB MISSING base FORM: ${cid}`);
        } else if (VERB_PERSON_LANGS.has(lang)) {
          const missing = PERSON_PARADIGM_KEYS.filter(
            k => !entry[k] || !String(entry[k]).trim()
          );
          if (missing.length) {
            errors.push(`VERB INCOMPLETE CONJUGATION [${missing.join(', ')}]: ${cid}`);
          }
        } else if (lang === 'en') {
          if (!entry['3_singular'] || !String(entry['3_singular']).trim()) {
            errors.push(`VERB MISSING 3_singular: ${cid}`);
          }
        }
      }
      // Countable nouns in gender-required langs should carry gender
      if (
        concept.type === 'noun' &&
        concept.countable &&
        GENDER_REQUIRED_LANGS.has(lang) &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        !entry.gender
      ) {
        warnings.push(`COUNTABLE NOUN MISSING gender: ${cid}`);
      }
    }

    results[lang] = { errors, warnings };
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== validate-packs.js ===\n');

  const langCodes = loadLanguageCodes();
  console.log(`Supported languages (${langCodes.length}): ${langCodes.join(', ')}\n`);

  const packs = discoverPacks();
  console.log(`Discovered ${packs.length} resource packs.\n`);

  let anyFailed = false;
  const summary = [];

  for (const packFile of packs) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, packFile), 'utf8'));
    const conceptCount = (data.concepts || []).length;
    const results = validatePack(data, langCodes);

    let packErrors = 0;
    let packWarnings = 0;
    const failingLangs = [];

    for (const lang of langCodes) {
      const { errors, warnings } = results[lang];
      packErrors += errors.length;
      packWarnings += warnings.length;
      if (errors.length) failingLangs.push(lang);
    }

    if (packErrors === 0) {
      console.log(`[${packFile}] PASS  (${conceptCount} concepts × ${langCodes.length} langs)` +
        (packWarnings ? `  — ${packWarnings} warning(s)` : ''));
      summary.push({ pack: packFile, status: 'PASS', errors: 0, warnings: packWarnings });
    } else {
      anyFailed = true;
      console.log(`[${packFile}] FAILED  (${packErrors} error(s) across: ${failingLangs.join(', ')})`);
      for (const lang of langCodes) {
        const { errors } = results[lang];
        if (errors.length) {
          // Collapse the common "whole block missing" case to one line.
          if (errors.length === 1 && errors[0].startsWith('MISSING LANGUAGE BLOCK')) {
            console.log(`         [${lang}] ERROR: ${errors[0]}`);
          } else {
            console.log(`         [${lang}] ${errors.length} error(s):`);
            for (const e of errors.slice(0, 8)) console.log(`           - ${e}`);
            if (errors.length > 8) console.log(`           … and ${errors.length - 8} more`);
          }
        }
      }
      summary.push({ pack: packFile, status: 'FAILED', errors: packErrors, warnings: packWarnings });
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('PACK                          STATUS    ERRORS  WARN');
  console.log('──────────────────────────────────────────────────');
  for (const row of summary) {
    console.log(
      `${row.pack.replace('.json', '').padEnd(28)}  ${row.status.padEnd(8)}  ` +
      `${String(row.errors).padStart(6)}  ${String(row.warnings).padStart(4)}`
    );
  }
  console.log('──────────────────────────────────────────────────');

  if (anyFailed) {
    console.log('\nRESULT: FAILED — packs are missing translations.\n');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASSED — every pack covers every language.\n');
  }
}

main();
