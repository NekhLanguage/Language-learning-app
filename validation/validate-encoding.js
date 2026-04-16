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

// Languages exempt from script checking (Latin-script languages)
const LATIN_LANGS = new Set(['en', 'de', 'pt', 'no', 'tr']);

// HTML entity patterns that should never appear in translated values
const HTML_ENTITY_RE = /&(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[\da-fA-F]{1,6});/;

// Pure ASCII check — a value made entirely of basic ASCII is suspect in a
// non-Latin language file (indicates an untranslated fallback)
const PURE_ASCII_RE  = /^[\x00-\x7F\s.,!?;:'"()\-]+$/;

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

  if (!rule) return errors; // Latin langs — skip script check on UI strings

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
