#!/usr/bin/env node
// validate-structure.js
// Checks every concept ID from vocab files has a valid, non-empty translation
// in every language file. Verbs must have a base form. No empty/null values.
// Run: node validation/validate-structure.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT     = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'lang');

const VOCAB_FILES = [
  'nouns.json',
  'adjectives.json',
  'verbs.json',
  'pronouns.json',
  'question_words.json',
  'quantifiers.json',
  'time_words.json',
  'glue_words.json',
  'directions_positions.json',
  'connectors.json',
  'numbers.json',
  'politeness_modality.json',
];

// Languages where countable nouns should carry a gender field
const GENDER_REQUIRED_LANGS = new Set(['de', 'pt', 'ar', 'it']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadConcepts() {
  const concepts = {};
  for (const file of VOCAB_FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  WARN: vocab file not found: ${file}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const concept of (data.concepts || [])) {
      if (concepts[concept.concept_id]) {
        console.warn(`  WARN: duplicate concept_id in vocab files: ${concept.concept_id}`);
      }
      concepts[concept.concept_id] = concept;
    }
  }
  return concepts;
}

// Returns the primary display string from a forms entry, or null if absent/empty
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

// Scans raw JSON text for duplicate top-level keys in the "forms" object.
// JSON.parse silently takes the last value, so we need raw text analysis.
function findDuplicateFormKeys(rawText) {
  const duplicates = [];
  const inForms = rawText.match(/"forms"\s*:\s*\{([\s\S]*)/);
  if (!inForms) return duplicates;

  const seen = {};
  const keyRe = /^\s+"([A-Z][A-Z0-9_]*)"\s*:/gm;
  let match;
  while ((match = keyRe.exec(inForms[1])) !== null) {
    const key = match[1];
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] === 2) duplicates.push(key); // report on second occurrence only
  }
  return duplicates;
}

// ─── Main validation ─────────────────────────────────────────────────────────

function validateLang(lang, langData, rawText, concepts) {
  const forms    = langData.forms || {};
  const errors   = [];
  const warnings = [];

  // 1. Duplicate form keys
  for (const key of findDuplicateFormKeys(rawText)) {
    errors.push(`DUPLICATE KEY in forms: ${key}`);
  }

  // 2. Per-concept checks
  for (const [cid, concept] of Object.entries(concepts)) {
    const entry = forms[cid];

    // 2a. Missing entirely
    if (entry === undefined || entry === null) {
      errors.push(`MISSING: ${cid}`);
      continue;
    }

    // 2b. Empty / blank value
    const primary = primaryValue(entry);
    if (!primary) {
      errors.push(`EMPTY VALUE: ${cid}`);
      continue;
    }

    // 2c. Verb must have a `base` key
    if (concept.type === 'verb') {
      if (typeof entry !== 'object' || Array.isArray(entry) || !entry.base) {
        errors.push(`VERB MISSING base FORM: ${cid}`);
      }
    }

    // 2d. Countable nouns in gender-required languages must have `gender`
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

  return { errors, warnings };
}

function main() {
  console.log('=== validate-structure.js ===\n');

  const concepts  = loadConcepts();
  const conceptCount = Object.keys(concepts).length;
  console.log(`Loaded ${conceptCount} concepts from ${VOCAB_FILES.length} vocab files.\n`);

  const langFiles = fs.readdirSync(LANG_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  let anyFailed = false;
  const summary = [];

  for (const langFile of langFiles) {
    const lang     = langFile.replace('.json', '');
    const filePath = path.join(LANG_DIR, langFile);
    const rawText  = fs.readFileSync(filePath, 'utf8');
    let langData;
    try {
      langData = JSON.parse(rawText);
    } catch (e) {
      console.log(`[${lang}] ERROR: invalid JSON — ${e.message}`);
      anyFailed = true;
      summary.push({ lang, status: 'FAILED', errors: 1, warnings: 0 });
      continue;
    }

    const { errors, warnings } = validateLang(lang, langData, rawText, concepts);

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`[${lang}] PASS`);
      summary.push({ lang, status: 'PASS', errors: 0, warnings: 0 });
    } else if (errors.length === 0) {
      console.log(`[${lang}] PASS  (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`);
      for (const w of warnings) console.log(`         WARN : ${w}`);
      summary.push({ lang, status: 'PASS', errors: 0, warnings: warnings.length });
    } else {
      anyFailed = true;
      console.log(`[${lang}] FAILED  (${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`);
      for (const e of errors)   console.log(`         ERROR: ${e}`);
      for (const w of warnings) console.log(`         WARN : ${w}`);
      summary.push({ lang, status: 'FAILED', errors: errors.length, warnings: warnings.length });
    }
  }

  // Summary table
  console.log('\n─────────────────────────────────────────');
  console.log('LANG  STATUS    ERRORS  WARNINGS');
  console.log('─────────────────────────────────────────');
  for (const row of summary) {
    const status   = row.status.padEnd(8);
    const errors   = String(row.errors).padStart(6);
    const warnings = String(row.warnings).padStart(8);
    console.log(`${row.lang.padEnd(4)}  ${status}  ${errors}  ${warnings}`);
  }
  console.log('─────────────────────────────────────────');

  if (anyFailed) {
    console.log('\nRESULT: FAILED — fix errors before launch.\n');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASSED structure check.\n');
  }
}

main();
