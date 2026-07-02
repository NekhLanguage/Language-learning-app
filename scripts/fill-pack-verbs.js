#!/usr/bin/env node
// fill-pack-verbs.js
// Merges authored present-tense verb paradigms from scripts/_verb_data/<lang>.json
// into each resource pack's languages.<lang>.forms.<CONCEPT>.
//
// Pack files use bespoke column alignment that does not survive a JSON
// reserialize, so we do targeted raw-text replacement scoped to the exact
// concept_id AND that language's base string (e.g. `"CAST": { "base": "чаклувати" }`).
// That pair is unique to one language block, so there is no cross-language
// collision. Each base-only verb object is replaced in place with the full
// paradigm (base kept verbatim). Identical concept+base pairs across packs are
// all updated (replace-all).
//
// Run: node scripts/fill-pack-verbs.js [--check]

'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, '_verb_data');
const LANGS = ['uk', 'ar', 'el', 'tr'];
const PARADIGM_KEYS = ['base', '1_singular', '2_singular', '3_singular', '1_plural', '2_plural', '3_plural'];
const CHECK = process.argv.includes('--check');

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pack files = top-level *.json with concepts[] and languages{}.
function discoverPacks() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.json'))
    .filter(f => {
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
      catch (e) { return false; }
      return d && Array.isArray(d.concepts) && d.languages && typeof d.languages === 'object';
    })
    .sort();
}

function loadAuthored() {
  const byLang = {};
  for (const lang of LANGS) {
    const p = path.join(DATA, `${lang}.json`);
    if (!fs.existsSync(p)) { console.warn(`[warn] missing authored data: ${p}`); continue; }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    // sanity: every entry must carry all paradigm keys, non-empty
    for (const [cid, entry] of Object.entries(data)) {
      for (const k of PARADIGM_KEYS) {
        if (!entry[k] || typeof entry[k] !== 'string' || !entry[k].trim()) {
          throw new Error(`${lang}.json: ${cid} missing/empty key "${k}"`);
        }
      }
    }
    byLang[lang] = data;
  }
  return byLang;
}

// Compact, key-ordered paradigm object literal (matches the inline pack style).
function paradigmLiteral(entry) {
  const parts = PARADIGM_KEYS.map(k => `"${k}": ${JSON.stringify(entry[k])}`);
  return `{ ${parts.join(', ')} }`;
}

function main() {
  const authored = loadAuthored();
  const packs = discoverPacks();
  let totalRepls = 0;
  const perLang = {};
  LANGS.forEach(l => perLang[l] = 0);

  for (const packFile of packs) {
    const full = path.join(ROOT, packFile);
    let text = fs.readFileSync(full, 'utf8');
    let changed = false;

    for (const lang of LANGS) {
      const data = authored[lang];
      if (!data) continue;
      for (const [cid, entry] of Object.entries(data)) {
        const base = entry.base;
        // Match: "CID" : { "base" : "<base>" }   (base-only object, flexible whitespace)
        const re = new RegExp(
          `("${reEscape(cid)}"\\s*:\\s*)\\{\\s*"base"\\s*:\\s*"${reEscape(base)}"\\s*\\}`,
          'g'
        );
        text = text.replace(re, (_m, head) => {
          changed = true;
          totalRepls++;
          perLang[lang]++;
          return head + paradigmLiteral(entry);
        });
      }
    }

    if (changed) {
      // Validate JSON before writing back.
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { throw new Error(`${packFile}: produced invalid JSON — ${e.message}`, { cause: e }); }
      if (!CHECK) fs.writeFileSync(full, text);
      console.log(`${CHECK ? '[check] ' : ''}${packFile}: updated`);
      void parsed;
    }
  }

  console.log(`\n${CHECK ? '[check] would apply' : 'applied'} ${totalRepls} verb-paradigm replacements ` +
    `(${LANGS.map(l => `${l}:${perLang[l]}`).join(', ')}).`);
}

main();
