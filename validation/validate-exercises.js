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
//   5. Pack coverage per language — for each registered resource pack, every
//      concept (from the pack's vocab JSON) and every template concept must
//      have a localized form in the merged forms map (lang/<code>.json forms
//      + pack JSON's languages.<code>.forms) for every non-EN language found
//      in lang/. Pack templates only carry render.en, so check 2 was blind to
//      this — packs could be registered and selectable but render raw English
//      concept keys in another language with nobody noticing until a learner
//      filed a bug.
//   6. Verb-in-predicate-noun template structure — templates whose concepts
//      include "BE" and whose final concept slot is type:verb produce broken
//      sentences in other languages (the documented "彼女はです料理する" bug:
//      "she is a cook" with COOK tagged as type:verb).
//
// Run: node validation/validate-exercises.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT     = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'lang');

const CORE_VOCAB_FILES = [
  'nouns.json', 'adjectives.json', 'verbs.json', 'pronouns.json',
  'question_words.json', 'quantifiers.json', 'time_words.json',
  'glue_words.json', 'directions_positions.json', 'connectors.json',
  'numbers.json', 'politeness_modality.json',
];

// Mirrors RESOURCE_PACKS in app.js. If a new pack is registered there, add
// it here too (or the pack will be silently skipped from validation).
const PACK_REGISTRY = [
  { id: 'pokemon',       vocabFile: 'pokemon.json',       templateFile: 'sentence_templates_pokemon.json' },
  { id: 'harry_potter',  vocabFile: 'harry_potter.json',  templateFile: 'sentence_templates_harry_potter.json' },
  { id: 'cooking',       vocabFile: 'cooking.json',       templateFile: 'sentence_templates_cooking.json' },
  { id: 'anime',         vocabFile: 'anime.json',         templateFile: 'sentence_templates_anime.json' },
  { id: 'football',      vocabFile: 'football.json',      templateFile: 'sentence_templates_football.json' },
  { id: 'music',         vocabFile: 'music.json',         templateFile: 'sentence_templates_music.json' },
  { id: 'everyday_life', vocabFile: 'everyday_life.json', templateFile: 'sentence_templates_everyday_life.json' },
  { id: 'fashion_style', vocabFile: 'fashion_style.json', templateFile: 'sentence_templates_fashion_style.json' },
  { id: 'gaming',        vocabFile: 'gaming.json',        templateFile: 'sentence_templates_gaming.json' },
  { id: 'tourism',       vocabFile: 'tourism.json',       templateFile: 'sentence_templates_tourism.json' },
  { id: 'space_scifi',   vocabFile: 'space_scifi.json',   templateFile: 'sentence_templates_space_scifi.json' },
];

// Types to check for distractor pool minimums
const POOL_TYPES       = ['noun', 'verb', 'adjective'];
const MIN_POOL_SIZE    = 4;

// Template files to validate (core + all pack templates from PACK_REGISTRY)
const TEMPLATE_FILES = [
  'sentence_templates.json',
  ...PACK_REGISTRY.map(p => p.templateFile),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadConcepts() {
  // Core vocab + every pack vocab. Pack concepts are tagged with their pack id
  // so the pack-coverage check can group them, but they merge into a single
  // flat concept map for the existing checks (templates / distractor pools).
  const concepts = {};
  for (const file of CORE_VOCAB_FILES) {
    const data = readJson(file);
    if (!data) continue;
    for (const c of (data.concepts || [])) {
      concepts[c.concept_id] = { ...c, source: file };
    }
  }
  for (const pack of PACK_REGISTRY) {
    const data = readJson(pack.vocabFile);
    if (!data) continue;
    for (const c of (data.concepts || [])) {
      concepts[c.concept_id] = { ...c, source: pack.vocabFile, pack: pack.id };
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
    const data = readJson(file);
    if (!data) continue;
    for (const t of (data.templates || [])) {
      templates.push({ ...t, _sourceFile: file });
    }
  }
  return templates;
}

// Per-pack per-language forms map, mirroring the runtime merge in app.js
// loadAndMergeVocab() — pack JSONs carry languages.<code>.forms which are
// stitched into GLOBAL_VOCAB.languages[<code>].forms alongside lang file forms.
function loadPackLangForms() {
  const packLangForms = {};
  for (const pack of PACK_REGISTRY) {
    const data = readJson(pack.vocabFile);
    packLangForms[pack.id] = {};
    if (!data) continue;
    for (const [lc, ld] of Object.entries(data.languages || {})) {
      packLangForms[pack.id][lc] = ld.forms || {};
    }
  }
  return packLangForms;
}

function loadPackTemplates() {
  const out = {};
  for (const pack of PACK_REGISTRY) {
    const data = readJson(pack.templateFile);
    out[pack.id] = (data?.templates || []).map(t => ({ ...t, _sourceFile: pack.templateFile }));
  }
  return out;
}

// Combined per-language forms (all pack JSON forms + lang/<code>.json forms).
// Matches what GLOBAL_VOCAB.languages[lang].forms looks like at runtime when
// every pack is selected. If a concept resolves here, the renderer can find it.
function buildMergedFormsForLang(lang, allLangData, packLangForms) {
  const merged = {};
  for (const pid of Object.keys(packLangForms)) {
    Object.assign(merged, packLangForms[pid][lang] || {});
  }
  Object.assign(merged, allLangData[lang]?.forms || {});
  return merged;
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

// ─── Check 5: Pack content coverage per language ─────────────────────────────

function checkPackCoverage(allLangData, packLangForms, packTemplates) {
  // For each pack × each non-EN lang found in lang/, walk the pack's vocab
  // concepts AND every concept referenced by the pack's templates, asserting
  // a localized form exists in the merged forms map (pack JSON forms + lang
  // file forms). This catches the class of bug where a pack is selectable in
  // onboarding but its content renders as raw English concept keys (the EN→JA
  // EL pack bug fixed 2026-05-22).
  //
  // Returns:
  //   {
  //     [packId]: {
  //       [lang]: {
  //         totalConcepts: number,
  //         missing: string[],          // missing concept IDs
  //         status: 'PASS' | 'PARTIAL' | 'NOT_LOCALIZED',
  //       }
  //     }
  //   }
  const report = {};
  const langs = Object.keys(allLangData).filter(l => l !== 'en');

  for (const pack of PACK_REGISTRY) {
    const data = readJson(pack.vocabFile);
    if (!data) {
      report[pack.id] = { error: `vocab file missing: ${pack.vocabFile}` };
      continue;
    }
    const vocabCids = (data.concepts || []).map(c => c.concept_id);

    // Pull every concept referenced by this pack's templates (in case a
    // template references a core concept the pack itself doesn't declare —
    // e.g. cooking templates use FIRST_PERSON_SINGULAR + SEE which live in
    // core vocab. We don't want to flag those as pack-missing, so we only
    // require pack-vocab concepts in the merged forms map.)
    const templateCids = new Set();
    for (const t of (packTemplates[pack.id] || [])) {
      for (const cid of (t.concepts || [])) templateCids.add(cid);
    }
    const vocabCidSet = new Set(vocabCids);

    report[pack.id] = {};
    for (const lang of langs) {
      const merged = buildMergedFormsForLang(lang, allLangData, packLangForms);
      const missing = vocabCids.filter(cid => !merged[cid]);
      // Also flag any pack-declared concept referenced by a template but
      // missing from the merged map. This is the canonical render path.
      for (const cid of templateCids) {
        if (vocabCidSet.has(cid) && !merged[cid] && !missing.includes(cid)) {
          missing.push(cid);
        }
      }

      let status;
      if (missing.length === 0) status = 'PASS';
      else if (missing.length === vocabCids.length) status = 'NOT_LOCALIZED';
      else status = 'PARTIAL';

      report[pack.id][lang] = {
        totalConcepts: vocabCids.length,
        missing,
        status,
      };
    }
  }

  return report;
}

// ─── Check 6: Verb-in-predicate-noun template structure ──────────────────────

function checkVerbInNounSlot(templates, concepts) {
  // The documented bug: a template like
  //   { template_id: "SHE_IS_COOK", concepts: ["SHE","BE","COOK"], render: { en: "She is a cook." } }
  // renders correctly in English because "cook" is both verb and noun, but in
  // Japanese the renderer slots COOK (type:verb) into a predicate-noun
  // position and produces "彼女はです料理する" (copula + verb base).
  //
  // Heuristic: any template whose concepts include "BE" and whose final
  // concept is type:verb is structurally wrong — either retype the concept
  // (verb → adjective/noun) or remove the template.
  const bugs = [];
  for (const tmpl of templates) {
    const cs = tmpl.concepts || [];
    if (cs.length < 2) continue;
    if (!cs.includes('BE')) continue;
    const last = cs[cs.length - 1];
    if (concepts[last]?.type === 'verb') {
      bugs.push({
        templateId: tmpl.template_id,
        source:     tmpl._sourceFile,
        finalConcept: last,
        renderEn:   tmpl.render?.en || '',
      });
    }
  }
  return bugs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== validate-exercises.js ===\n');

  const concepts      = loadConcepts();
  const allLangData   = loadAllLangData();
  const templates     = loadAllTemplates();
  const packLangForms = loadPackLangForms();
  const packTemplates = loadPackTemplates();
  const allLangs      = Object.keys(allLangData).sort();

  console.log(`Languages  : ${allLangs.join(', ')}`);
  console.log(`Templates  : ${templates.length} total across ${TEMPLATE_FILES.length} files`);
  console.log(`Concepts   : ${Object.keys(concepts).length} (core + pack)`);
  console.log(`Packs      : ${PACK_REGISTRY.map(p => p.id).join(', ')}\n`);

  // ── Run all checks ──────────────────────────────────────────────────────────
  const uiResults      = checkUiStrings(allLangData);
  const templateIssues = checkTemplates(templates, allLangData);
  const poolIssues     = checkDistractorPools(allLangData, concepts);
  const surfaceIssues  = checkSurfaceRender(templates);
  const packReport     = checkPackCoverage(allLangData, packLangForms, packTemplates);
  const verbNounBugs   = checkVerbInNounSlot(templates, concepts);

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

  // ── Pack coverage report (per pack × per non-EN lang) ──────────────────────
  console.log('\n=== PACK CONTENT COVERAGE ===');
  console.log('Per pack × per non-EN lang. PARTIAL coverage = broken sentences');
  console.log('for the missing concepts (a real bug). NOT_LOCALIZED = pack has');
  console.log('no translations for this lang (content gap, not a code bug).\n');

  const packRows = [];
  let partialCount = 0;
  let notLocalizedCount = 0;
  for (const pack of PACK_REGISTRY) {
    const langs = packReport[pack.id];
    if (!langs || langs.error) {
      console.log(`[${pack.id}] ${langs?.error || 'no data'}`);
      continue;
    }
    const langKeys = Object.keys(langs).sort();
    const pass        = langKeys.filter(l => langs[l].status === 'PASS');
    const partial     = langKeys.filter(l => langs[l].status === 'PARTIAL');
    const notLocalized = langKeys.filter(l => langs[l].status === 'NOT_LOCALIZED');

    partialCount      += partial.length;
    notLocalizedCount += notLocalized.length;

    const passStr      = pass.length ? `PASS: ${pass.join(',')}` : '';
    const partialStr   = partial.length ? `PARTIAL: ${partial.map(l => `${l}(${langs[l].missing.length}/${langs[l].totalConcepts})`).join(',')}` : '';
    const nlStr        = notLocalized.length ? `NOT_LOCALIZED: ${notLocalized.join(',')}` : '';
    const parts        = [passStr, partialStr, nlStr].filter(Boolean);
    console.log(`[${pack.id.padEnd(13)}] ${parts.join(' | ')}`);

    for (const l of partial) {
      const m = langs[l].missing;
      const preview = m.slice(0, 5).join(', ') + (m.length > 5 ? `, …(+${m.length - 5})` : '');
      console.log(`               WARN: ${l} partial — missing ${m.length}/${langs[l].totalConcepts}: ${preview}`);
    }

    packRows.push({ pack: pack.id, pass: pass.length, partial: partial.length, notLocalized: notLocalized.length });
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('PACK             PASS   PARTIAL   NOT_LOCALIZED');
  console.log('─────────────────────────────────────────────────────────');
  for (const r of packRows) {
    console.log(`${r.pack.padEnd(15)}  ${String(r.pass).padStart(4)}  ${String(r.partial).padStart(8)}  ${String(r.notLocalized).padStart(14)}`);
  }
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Totals: ${partialCount} partial (real bugs), ${notLocalizedCount} not-localized (content gaps).`);

  // ── Verb-in-noun-slot bugs (predicate-noun structural error) ───────────────
  console.log('\n=== VERB-IN-PREDICATE-NOUN STRUCTURAL BUGS ===');
  if (verbNounBugs.length === 0) {
    console.log('None found.');
  } else {
    console.log('Templates with [..., BE, <verb-concept>] structure — these');
    console.log('produce broken sentences in non-EN languages (e.g. "彼女は');
    console.log('です料理する" — copula + verb base). Fix by either removing');
    console.log('the template or retyping the final concept (verb → noun/adj).\n');
    for (const b of verbNounBugs) {
      console.log(`  ERROR: [${b.source}] ${b.templateId} → final concept ${b.finalConcept} is type:verb`);
      console.log(`         render.en="${b.renderEn}"`);
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.log('\nRESULT: FAILED — fix errors before launch.\n');
    process.exit(1);
  } else if (partialCount > 0) {
    console.log('\nRESULT: PASSED with WARNINGS — pack partial-coverage gaps surfaced above.\n');
  } else {
    console.log('\nRESULT: PASSED exercise check.\n');
  }
}

main();
