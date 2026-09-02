#!/usr/bin/env node
// validate-encoding.js
// Detects Latin-script fallbacks, wrong-script characters, and HTML entities
// in non-Latin language files. Also flags values identical to the English form.
// Run: node validation/validate-encoding.js

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT     = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'lang');

// ─── Script detection rules ──────────────────────────────────────────────────
// Each rule: at least one character from this range must appear in the value.
// If zero characters match, the value is flagged as wrong/missing script.

const SCRIPT_RULES = {
  ar: {
    name: 'Arabic',
    re: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/,
  },
  ja: {
    name: 'Japanese (Hiragana/Katakana/CJK)',
    // Allow CJK + kana; also allow lone Arabic numerals (numbers.json)
    re: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\u31F0-\u31FF]/,
  },
  ko: {
    name: 'Korean (Hangul)',
    re: /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
  },
  el: {
    name: 'Greek',
    re: /[\u0370-\u03FF\u1F00-\u1FFF]/,
  },
  uk: {
    name: 'Ukrainian (Cyrillic)',
    re: /[\u0400-\u04FF\u0500-\u052F]/,
  },
};

// Latin-script languages (language_rules latinEncodingChecks — the unit
// suite pins this set to the declarations). These run the INVERSE check:
// any character from a non-Latin script inside their values is a
// copy-paste leak from another language's data. Born from Emi run-7 -32:
// a Finnish grammar note shipped with «книга → Я читаю книгу» in it, and
// nothing ever looked.
const LATIN_LANGS = new Set(['en', 'de', 'pt', 'no', 'tr', 'pl', 'fi']);

// Any character of a script a Latin-language value must never contain:
// Greek, Cyrillic, Arabic, Devanagari, Thai, Hangul (jamo + syllables),
// kana, CJK. Whole script blocks on purpose — combining marks included,
// since ANY character from these blocks is a leak in Latin data.
/* eslint-disable no-misleading-character-class -- whole script blocks
   on purpose: combining marks included, any char here is a leak */
const FOREIGN_SCRIPT_RE = new RegExp(
  '[\\u0370-\\u03FF\\u1F00-\\u1FFF' + // Greek + Greek Extended
  '\\u0400-\\u052F' +                 // Cyrillic + Supplement
  '\\u0600-\\u06FF\\u0750-\\u077F' + // Arabic
  '\\u0900-\\u097F' +                 // Devanagari
  '\\u0E00-\\u0E7F' +                 // Thai
  '\\u1100-\\u11FF\\u3130-\\u318F' + // Hangul jamo
  '\\u3040-\\u30FF\\u31F0-\\u31FF' + // kana
  '\\u4E00-\\u9FFF' +                 // CJK ideographs
  '\\uAC00-\\uD7A3]');                // Hangul syllables
/* eslint-enable no-misleading-character-class */

// Cyrillic specifically — never legitimate in grammar_notes.json outside
// the uk support-language entries (the run-7 -32 class).
const CYRILLIC_RE = /[\u0400-\u052F]/;

// HTML entity patterns that should never appear in translated values
const HTML_ENTITY_RE = /&(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[\da-fA-F]{1,6});/;

// Pure ASCII check — a value made entirely of basic ASCII is suspect in a
// non-Latin language file (indicates an untranslated fallback)
const PURE_ASCII_RE  = /^[\x00-\x7F\s.,!?;:'"()-]+$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Metadata keys that are never translation strings — skip these when checking scripts
const METADATA_KEYS = new Set(['gender', 'article', 'romanization', 'ttsText']);

// Conjugation keys whose values are translation strings and should be checked
const CONJUGATION_KEY_RE = /^(\d+_(singular|plural)|base|form)$/;

// Collect all displayable translation strings from a forms entry.
// Deliberately excludes metadata fields like gender ("m"/"f"), article ("a"/"an"),
// and romanization, which are single Latin chars and valid in all language files.
function extractStrings(entry) {
  if (!entry) return [];
  if (typeof entry === 'string') return [entry];
  if (Array.isArray(entry))     return entry.filter(s => typeof s === 'string');
  if (typeof entry === 'object') {
    const results = [];
    for (const [key, val] of Object.entries(entry)) {
      if (METADATA_KEYS.has(key)) continue;
      if (typeof val === 'string') results.push(val);
    }
    return results;
  }
  return [];
}

function loadForms(langCode) {
  const filePath = path.join(LANG_DIR, `${langCode}.json`);
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.forms || {};
}

// Build a flat map of concept → first English string for comparison
function buildEnglishMap(enForms) {
  const map = {};
  for (const [cid, entry] of Object.entries(enForms)) {
    const strs = extractStrings(entry);
    if (strs[0]) map[cid] = strs[0].toLowerCase().trim();
  }
  return map;
}

// ─── Main validation ─────────────────────────────────────────────────────────

function validateLang(lang, forms, englishMap) {
  const rule       = SCRIPT_RULES[lang];
  const isNonLatin = !!rule;
  const errors     = [];
  const warnings   = [];

  for (const [cid, entry] of Object.entries(forms)) {
    const strings = extractStrings(entry);

    for (const str of strings) {
      if (!str || !str.trim()) continue;
      const trimmed = str.trim();

      // 1. HTML entities
      if (HTML_ENTITY_RE.test(trimmed)) {
        errors.push(`HTML ENTITY in ${cid}: "${trimmed}"`);
      }

      // 2-inverse. Latin languages: no foreign-script characters, ever.
      if (LATIN_LANGS.has(lang) && FOREIGN_SCRIPT_RE.test(trimmed)) {
        errors.push(`FOREIGN SCRIPT in ${cid}: "${trimmed}"`);
      }

      // 2. Non-Latin script checks
      if (isNonLatin) {
        // 2a. Value contains zero characters from expected script
        if (!rule.re.test(trimmed)) {
          // Only flag if it looks like actual Latin text, not punctuation-only
          if (/[A-Za-z]/.test(trimmed) || PURE_ASCII_RE.test(trimmed)) {
            errors.push(`WRONG SCRIPT (expected ${rule.name}) in ${cid}: "${trimmed}"`);
          }
        }

        // 2b. Identical to English value — strong sign of copy-paste fallback
        const enVal = englishMap[cid];
        if (enVal && trimmed.toLowerCase() === enVal) {
          errors.push(`IDENTICAL TO ENGLISH in ${cid}: "${trimmed}"`);
        }
      }

      // 3. All languages: check uiStrings values (covered below separately)
      // 4. Control characters / null bytes
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
        errors.push(`CONTROL CHARACTER in ${cid}: (non-printable bytes detected)`);
      }
    }
  }

  return { errors, warnings };
}

function validateUiStrings(lang, uiStrings, enUiStrings) {
  const rule   = SCRIPT_RULES[lang];
  const errors = [];

  // Latin languages: the inverse check covers UI strings too.
  if (LATIN_LANGS.has(lang)) {
    for (const [key, val] of Object.entries(uiStrings)) {
      if (typeof val === 'string' && FOREIGN_SCRIPT_RE.test(val)) {
        errors.push(`FOREIGN SCRIPT in uiStrings.${key}: "${val.trim()}"`);
      }
    }
    return errors;
  }

  if (!rule) return errors; // other Latin-script langs without declarations

  for (const [key, val] of Object.entries(uiStrings)) {
    if (!val || !val.trim()) continue;
    const trimmed = val.trim();
    const enVal   = enUiStrings[key];

    // Flag if identical to English (and the English value looks like real text)
    if (enVal && trimmed === enVal && /[A-Za-z]{3,}/.test(enVal)) {
      errors.push(`UI STRING IDENTICAL TO ENGLISH — "${key}": "${trimmed}"`);
    }
  }

  return errors;
}

// ─── Wider coverage: packs, templates, grammar notes ─────────────────────────
// The run-7 -32 leak lived OUTSIDE lang/ — grammar_notes.json — and this
// validator never read it. These walks apply the Latin-language inverse
// check to every place a Latin language's display text is authored.

const PACK_FILES = [
  'pokemon.json', 'harry_potter.json', 'cooking.json', 'anime.json',
  'football.json', 'music.json', 'everyday_life.json', 'fashion_style.json',
  'gaming.json', 'tourism.json', 'space_scifi.json', 'fitness.json',
];

function validatePacks() {
  const errors = [];
  for (const file of PACK_FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    for (const [lang, block] of Object.entries(data.languages || {})) {
      if (!LATIN_LANGS.has(lang)) continue;
      for (const [cid, entry] of Object.entries(block.forms || {})) {
        for (const str of extractStrings(entry)) {
          if (FOREIGN_SCRIPT_RE.test(str)) {
            errors.push(`FOREIGN SCRIPT in ${file} ${lang}.${cid}: "${str.trim()}"`);
          }
        }
      }
    }
  }
  return errors;
}

function validateTemplates() {
  const errors = [];
  const files = fs.readdirSync(ROOT)
    .filter(f => /^sentence_templates.*\.json$/.test(f)).sort();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const templates = Array.isArray(data) ? data : data.templates || [];
    for (const tpl of templates) {
      const id = tpl.template_id || '?';
      for (const blockName of ['render', 'surface']) {
        for (const [lang, val] of Object.entries(tpl[blockName] || {})) {
          if (!LATIN_LANGS.has(lang)) continue;
          const strs = typeof val === 'string' ? [val]
            : Object.values(val || {}).filter(v => typeof v === 'string');
          for (const str of strs) {
            if (FOREIGN_SCRIPT_RE.test(str)) {
              errors.push(`FOREIGN SCRIPT in ${file} ${id} ${blockName}.${lang}: "${str.trim()}"`);
            }
          }
        }
      }
    }
  }
  return errors;
}

// A rule id prefixed with a language code (ja_counter,
// zh_predicate_adjective) fires only when the TARGET is that language,
// so its notes legitimately quote that language's script in every
// support language — strip those characters before the foreign check.
const RULE_PREFIX_ALLOWED = {
  // CJK punctuation + kana (+ extensions) + CJK ideographs
  ja_: /[\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FFF]/g,
  // CJK punctuation + CJK ideographs
  zh_: /[\u3000-\u303F\u4E00-\u9FFF]/g,
  // Arabic block + presentation forms \u2014 an ar_ rule fires only when the
  // target is Arabic, so its notes legitimately quote \u00AB\u0643\u062A\u0627\u0628 \u0648\u0627\u062D\u062F\u00BB in every
  // support language.
  ar_: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g,
  // classifier fires only when the TARGET is zh or ko \u2014 its notes quote
  // both scripts (\u4E24\u672C\u4E66, \uCC45 \uB450 \uAD8C) in every support language.
  classifier: /[\u3000-\u303F\u4E00-\u9FFF\uAC00-\uD7A3]/g,
};

function validateGrammarNotes() {
  const errors = [];
  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'grammar_notes.json'), 'utf8'));
  for (const [rule, byLang] of Object.entries(data.notes || {})) {
    const allowed = Object.entries(RULE_PREFIX_ALLOWED)
      .find(([prefix]) => rule.startsWith(prefix))?.[1];
    for (const [lang, note] of Object.entries(byLang)) {
      if (lang === 'uk') continue; // Ukrainian text is legitimate there
      let text = `${note?.title || ''} ${note?.body || ''}`;
      if (allowed) text = text.replace(allowed, '');
      if (CYRILLIC_RE.test(text)) {
        errors.push(`CYRILLIC in grammar_notes ${rule}.${lang}: "${text.trim().slice(0, 60)}…"`);
      }
      if (LATIN_LANGS.has(lang) && FOREIGN_SCRIPT_RE.test(text)) {
        errors.push(`FOREIGN SCRIPT in grammar_notes ${rule}.${lang}: "${text.trim().slice(0, 60)}…"`);
      }
    }
  }
  return errors;
}

function main() {
  console.log('=== validate-encoding.js ===\n');

  const enFilePath = path.join(LANG_DIR, 'en.json');
  const enData     = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
  const englishMap = buildEnglishMap(enData.forms || {});
  const enUiStrings = enData.uiStrings || {};

  const langFiles = fs.readdirSync(LANG_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  let anyFailed = false;
  const summary = [];

  for (const langFile of langFiles) {
    const lang = langFile.replace('.json', '');

    if (lang === 'en') {
      console.log(`[en] SKIP (reference language)`);
      summary.push({ lang, status: 'SKIP', errors: 0 });
      continue;
    }

    const filePath = path.join(LANG_DIR, langFile);
    let langData;
    try {
      langData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.log(`[${lang}] ERROR: invalid JSON — ${e.message}`);
      anyFailed = true;
      summary.push({ lang, status: 'FAILED', errors: 1 });
      continue;
    }

    const { errors: formErrors } = validateLang(lang, langData.forms || {}, englishMap);
    const uiErrors               = validateUiStrings(lang, langData.uiStrings || {}, enUiStrings);
    const allErrors              = [...formErrors, ...uiErrors];

    if (allErrors.length === 0) {
      console.log(`[${lang}] PASS`);
      summary.push({ lang, status: 'PASS', errors: 0 });
    } else {
      anyFailed = true;
      console.log(`[${lang}] FAILED  (${allErrors.length} error${allErrors.length !== 1 ? 's' : ''})`);
      for (const e of allErrors) console.log(`         ERROR: ${e}`);
      summary.push({ lang, status: 'FAILED', errors: allErrors.length });
    }
  }

  // Packs, templates, grammar notes — the leak surface lang/ never covered.
  for (const [label, fn] of [
    ['packs', validatePacks],
    ['templates', validateTemplates],
    ['grammar notes', validateGrammarNotes],
  ]) {
    const errs = fn();
    if (errs.length === 0) {
      console.log(`[${label}] PASS`);
    } else {
      anyFailed = true;
      console.log(`[${label}] FAILED  (${errs.length} error${errs.length !== 1 ? 's' : ''})`);
      for (const e of errs) console.log(`         ERROR: ${e}`);
    }
    summary.push({ lang: label, status: errs.length ? 'FAILED' : 'PASS', errors: errs.length });
  }

  // Summary table
  console.log('\n─────────────────────────────────────────');
  console.log('LANG  STATUS    ERRORS');
  console.log('─────────────────────────────────────────');
  for (const row of summary) {
    console.log(`${row.lang.padEnd(4)}  ${row.status.padEnd(8)}  ${String(row.errors).padStart(6)}`);
  }
  console.log('─────────────────────────────────────────');

  if (anyFailed) {
    console.log('\nRESULT: FAILED — fix encoding errors before launch.\n');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASSED encoding check.\n');
  }
}

main();
