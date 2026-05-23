#!/usr/bin/env node
// validate-exercises.js
// Checks:
//   1. uiStrings completeness — every key in en.json must exist in every other lang
//   2. Sentence template integrity — all concept IDs referenced in templates
//      must exist in each language that has a render for that template
//   3. Distractor pool size — each language needs ≥4 distinct translated values
//      per word type (noun, verb, adjective) to generate multiple-choice exercises
//   4. Surface/render mismatch — each surface form value must appear verbatim
//      in its template's render string
//
// Run: node validation/validate-exercises.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT     = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'lang');

const VOCAB_FILES = [
  'nouns.json', 'adjectives.json', 'verbs.json', 'pronouns.json',
  'question_words.json', 'quantifiers.json', 'time_words.json',
  'glue_words.json', 'directions_positions.json', 'connectors.json',
  'numbers.json', 'politeness_modality.json',
];

// Types to check for distractor pool minimums
const POOL_TYPES       = ['noun', 'verb', 'adjective'];
const MIN_POOL_SIZE    = 4;

// Template files are auto-discovered from the repo root by filename convention:
// every `sentence_templates*.json` is included. This mirrors how loadAllLangData
// reads lang/*.json off disk and removes the register-but-forget failure mode
// for resource packs — adding a pack template file picks it up automatically.
function discoverTemplateFiles() {
  return fs.readdirSync(ROOT)
    .filter(f => /^sentence_templates.*\.json$/.test(f))
    .sort();
}
const TEMPLATE_FILES = discoverTemplateFiles();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadConcepts() {
  const concepts = {};
  for (const file of VOCAB_FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const c of (data.concepts || [])) {
      concepts[c.concept_id] = c;
    }
  }
  return concepts;
}

function loadAllLangData() {
  const langs = {};
  const langFiles = fs.readdirSync(LANG_DIR).filter(f => f.endsWith('.json'));
  for (const f of langFiles) {
    const code = f.replace('.json', '');
    langs[code] = JSON.parse(fs.readFileSync(path.join(LANG_DIR, f), 'utf8'));
  }
  return langs;
}

function loadAllTemplates() {
  const templates = [];
  for (const file of TEMPLATE_FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const t of (data.templates || [])) {
      templates.push({ ...t, _sourceFile: file });
    }
  }
  return templates;
}

// Returns the primary display string from a forms entry
function primaryValue(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (Array.isArray(entry))     return (entry[0] || '').trim() || null;
  if (typeof entry === 'object') return (entry.form || entry.base || '').trim() || null;
  return null;
}

// ─── Check 1: uiStrings completeness ─────────────────────────────────────────

function checkUiStrings(allLangData) {
  const enKeys = new Set(Object.keys(allLangData['en']?.uiStrings || {}));
  const results = {};

  for (const [lang, data] of Object.entries(allLangData)) {
    if (lang === 'en') continue;
    const langKeys = new Set(Object.keys(data.uiStrings || {}));
    const missing  = [...enKeys].filter(k => !langKeys.has(k));
    results[lang]  = missing;
  }
  return results;
}

// ─── Check 2: Sentence template concept coverage ──────────────────────────────

function checkTemplates(templates, allLangData) {
  // Returns: Map<lang, Array<{templateId, sourceFile, missingConcepts}>>
  const issues = {};

  for (const tmpl of templates) {
    const renderedLangs = Object.keys(tmpl.render || {});

    for (const lang of renderedLangs) {
      const forms = allLangData[lang]?.forms;
      if (!forms) continue; // language file doesn't exist — structure check handles this

      const errors = issues[lang] || (issues[lang] = []);

      // All concept IDs listed in template.concepts must be in forms
      for (const cid of (tmpl.concepts || [])) {
        if (!forms[cid]) {
          errors.push({
            templateId: tmpl.template_id,
            source: tmpl._sourceFile,
            problem: `concept ${cid} missing from forms`,
          });
        }
      }

      // All choices in questions must also be in forms
      for (const [qKey, qData] of Object.entries(tmpl.questions || {})) {
        for (const cid of (qData.choices || [])) {
          if (!forms[cid]) {
            errors.push({
              templateId: tmpl.template_id,
              source: tmpl._sourceFile,
              problem: `question "${qKey}" choice ${cid} missing from forms`,
            });
          }
        }
        // Answer concept must exist too
        if (qData.answer && !forms[qData.answer]) {
          errors.push({
            templateId: tmpl.template_id,
            source: tmpl._sourceFile,
            problem: `question "${qKey}" answer ${qData.answer} missing from forms`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── Check 3: Distractor pool sizes ──────────────────────────────────────────

function checkDistractorPools(allLangData, concepts) {
  // Returns: Map<lang, Array<{type, count, minimum}>>
  const issues = {};

  for (const [lang, data] of Object.entries(allLangData)) {
    const forms = data.forms || {};
    const langIssues = [];

    for (const type of POOL_TYPES) {
      const conceptsOfType = Object.values(concepts).filter(c => c.type === type);
      const distinctValues = new Set();

      for (const concept of conceptsOfType) {
        const val = primaryValue(forms[concept.concept_id]);
        if (val) distinctValues.add(val.toLowerCase());
      }

      if (distinctValues.size < MIN_POOL_SIZE) {
        langIssues.push({
          type,
          count:   distinctValues.size,
          minimum: MIN_POOL_SIZE,
        });
      }
    }

    if (langIssues.length > 0) {
      issues[lang] = langIssues;
    }
  }

  return issues;
}

// ─── Check 4: Surface/render mismatch ────────────────────────────────────────

function checkSurfaceRender(templates) {
  // Returns: Map<lang, Array<{templateId, concept, surfaceValue, render}>>
  const issues = {};

  for (const tmpl of templates) {
    const surface = tmpl.surface || {};
    const render  = tmpl.render  || {};

    for (const [lang, surfaceMap] of Object.entries(surface)) {
      const renderStr = render[lang];
      if (!renderStr) continue; // no render for this lang in this template

      const langIssues = issues[lang] || (issues[lang] = []);

      for (const [cid, surfaceVal] of Object.entries(surfaceMap)) {
        if (!surfaceVal) continue;
        // Surface value must appear somewhere in the render string.
        // Case-insensitive to handle sentence-initial capitalisation
        // (e.g. surface "ela" correctly matches "Ela vê um telefone.").
        if (!renderStr.toLowerCase().includes(surfaceVal.toLowerCase())) {
          langIssues.push({
            templateId:   tmpl.template_id,
            concept:      cid,
            surfaceValue: surfaceVal,
            render:       renderStr,
          });
        }
      }
    }
  }

  return issues;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== validate-exercises.js ===\n');

  const concepts    = loadConcepts();
  const allLangData = loadAllLangData();
  const templates   = loadAllTemplates();
  const allLangs    = Object.keys(allLangData).sort();

  console.log(`Languages  : ${allLangs.join(', ')}`);
  console.log(`Templates  : ${templates.length} total across ${TEMPLATE_FILES.length} files`);
  console.log(`Concepts   : ${Object.keys(concepts).length}\n`);

  // ── Run all checks ──────────────────────────────────────────────────────────
  const uiResults      = checkUiStrings(allLangData);
  const templateIssues = checkTemplates(templates, allLangData);
  const poolIssues     = checkDistractorPools(allLangData, concepts);
  const surfaceIssues  = checkSurfaceRender(templates);

  // ── Report per language ─────────────────────────────────────────────────────
  let anyFailed = false;
  const summary = [];

  for (const lang of allLangs) {
    if (lang === 'en') continue; // en is the reference; skip self-check

    const missingUi   = uiResults[lang]       || [];
    const tmplErrors  = templateIssues[lang]  || [];
    const pools       = poolIssues[lang]      || [];
    const surface     = surfaceIssues[lang]   || [];

    const errors   = [];
    const warnings = [];

    // UI strings — missing key falls back to English at runtime (by design
    // for English-first rollouts). Flag as a warning rather than a hard error.
    for (const key of missingUi) {
      warnings.push(`UI STRING MISSING: "${key}" (English will display)`);
    }

    // Template concept gaps
    for (const t of tmplErrors) {
      errors.push(`TEMPLATE [${t.templateId}] in ${t.source}: ${t.problem}`);
    }

    // Distractor pool too small
    for (const p of pools) {
      errors.push(`DISTRACTOR POOL TOO SMALL: ${p.type}s = ${p.count} (need ${p.minimum})`);
    }

    // Surface/render mismatches
    for (const s of surface) {
      warnings.push(`SURFACE MISMATCH [${s.templateId}] ${s.concept}: "${s.surfaceValue}" not found in "${s.render}"`);
    }

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
    console.log('\nRESULT: PASSED exercise check.\n');
  }
}

main();
