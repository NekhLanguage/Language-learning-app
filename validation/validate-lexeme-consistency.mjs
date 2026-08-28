#!/usr/bin/env node
// validate-lexeme-consistency.mjs
// The dictionary-vs-corpus check (Nekh-approved 2026-08-28): the app has
// two sources of every language — the DICTIONARY (lang/*.json + pack
// forms, used to build sentences) and the authored MODEL SENTENCES (the
// native-speaker ground truth in the templates). Nothing ever checked that
// they agree, so Korean taught 얻다 on the flashcard while every native
// model sentence used 받다, and casual 나 while the corpus is polite 저 —
// both "correct" in isolation, teaching two different languages together.
//
// This validator walks every template that carries per-concept surface
// maps (the authored native word for each concept in that sentence —
// complete for all languages wherever present) and asserts the surface
// word belongs to the dictionary entry for that concept. Matching
// (lib/lexeme-match-core.mjs, unit-tested): exact authored field →
// whole-word containment → engine-DERIVED case forms (the real
// accusativeNoun/caseFormFor, so strategy-derived inflections like uk
// «їжу» are never false positives) → a guarded common-prefix fallback for
// languages that declare inflection machinery. A genuine lexeme swap
// shares none of these and is caught the day it is authored.
//
// Findings are ratcheted (validation/lexeme-consistency-baseline.json):
// pre-existing mismatches are the owner-visible backlog; NEW ones fail.
//
// Run:  node validation/validate-lexeme-consistency.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import {
  configureEngine, accusativeNoun, caseFormFor, formOf,
} from '../sentence_engine.mjs';
import { langRuleValue, langRule } from '../language_rules.mjs';
import { entryCandidates, surfaceMatchesEntry } from './lib/lexeme-match-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'lexeme-consistency-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();

configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  rng: () => 0.999,
});

// Engine-derived forms for a concept in `lang`: the declared case fields
// plus the strategy-derived accusative — computed by the SAME functions the
// renderer uses, so the check cannot drift from what learners see.
function derivedForms(lang, cid) {
  const out = [];
  const base = formOf(lang, cid);
  const acc = accusativeNoun(lang, cid, base);
  if (acc && acc !== base) out.push(acc);
  const cm = langRuleValue(lang, 'caseMarking');
  if (cm) {
    const cases = new Set([
      cm.directObjectCase, cm.predicateNounCase,
      ...Object.values(cm.prepositions || {}),
    ].filter(Boolean));
    for (const c of cases) {
      const f = caseFormFor(lang, cid, c);
      if (f) out.push(f);
      const fp = caseFormFor(lang, cid, `${c}_plural`);
      if (fp) out.push(fp);
    }
  }
  return out;
}

function allowPrefixFor(lang) {
  return !!langRuleValue(lang, 'caseMarking') ||
    langRule(lang, 'possessiveSuffixes') ||
    !!langRuleValue(lang, 'adjectiveDeclension');
}

const findings = new Map(); // key -> detail
for (const tpl of templates) {
  if (!tpl.surface || !Object.keys(tpl.surface).length) continue;
  for (const lang of langCodes) {
    const surfaceMap = tpl.surface[lang];
    if (!surfaceMap) continue;
    for (const [cid, surface] of Object.entries(surfaceMap)) {
      const entry = vocab.languages?.[lang]?.forms?.[cid];
      if (entry === undefined) continue; // entry completeness is validate-packs' job
      const candidates = entryCandidates(entry);
      if (!candidates.size) continue;
      if (surfaceMatchesEntry(surface, candidates, {
        derived: derivedForms(lang, cid),
        allowPrefix: allowPrefixFor(lang),
      })) continue;
      // Dedupe by lang|cid|surface — the same disagreement shows up in
      // every template that uses the pair; one finding is the signal.
      const key = `${lang}|${cid}|${surface}`;
      if (!findings.has(key)) {
        findings.set(key, {
          dictionary: [...candidates].slice(0, 4).join(' / '),
          example: `${tpl.template_id} (${tpl._file})`,
        });
      }
    }
  }
}

const byLang = {};
for (const k of findings.keys()) {
  const l = k.split('|')[0];
  byLang[l] = (byLang[l] || 0) + 1;
}
console.log(`Lexeme consistency: ${findings.size} dictionary/corpus disagreement(s)`,
  Object.keys(byLang).length ? byLang : '');

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE,
    JSON.stringify([...findings.keys()].sort(), null, 2) + '\n');
  console.log(`Baseline updated: ${findings.size} entries -> ${path.relative(process.cwd(), BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }
const known = new Set(baseline);
const fresh = [...findings.keys()].filter((k) => !known.has(k));
const fixed = baseline.filter((k) => !findings.has(k));

console.log(`Baseline: ${known.size} known · new: ${fresh.length} · fixed (removable): ${fixed.length}`);
if (fresh.length) {
  console.error('\nNEW dictionary/corpus disagreements — the flashcard and the native');
  console.error('sentences teach different words. Align the dictionary with the corpus');
  console.error('(the corpus is the ground truth), or baseline deliberately with:');
  console.error('  npm run validate:lexemes:update\n');
  for (const k of fresh.slice(0, 25)) {
    const d = findings.get(k);
    console.error(`  ${k}\n     dictionary: ${d.dictionary}\n     seen in   : ${d.example}`);
  }
  if (fresh.length > 25) console.error(`  … and ${fresh.length - 25} more`);
  process.exit(1);
}
if (fixed.length) {
  console.log('Fixed disagreements — prune with: npm run validate:lexemes:update');
}
console.log('No new dictionary/corpus disagreements. PASS.');
