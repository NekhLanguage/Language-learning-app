#!/usr/bin/env node
// validate-language-profiles.mjs
// The typological QUESTIONNAIRE check (Nekh-approved 2026-08-28). Every
// shipped language answers the same fixed set of yes/no questions about how
// it works (validation/language-profiles.json); this validator asserts that
// every "yes" is ON THE BOOKS in language_rules.mjs — as a declared feature
// or a row flag. Whether a declared need is then IMPLEMENTED is the
// coverage matrix's job (validate-grammar-coverage); the two checks
// deliberately split "is the question answered" from "is the answer built".
//
// Why: Korean shipped unusable with a green coverage matrix because its
// features block declared only the two things that worked — the matrix can
// check a half-declared language, never a barely-declared one. A fixed
// questionnaire makes under-declaration impossible: the classifier question
// is asked of every language, whether or not the author thought of it.
//
// Failure contract:
//   HARD (never baselined): a language in languages.js with NO profile, a
//     profile for an unknown language, a profile missing an axis or
//     carrying an unknown axis.
//   Ratcheted per language (validation/language-profiles-baseline.json,
//     keyed {lang: [axis, …]}): a true axis with no declared evidence. A
//     language ABSENT from the baseline is NEW → any gap is a hard fail
//     (new languages don't get to accumulate silent debt).
//
// Run:  node validation/validate-language-profiles.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGE_RULES } from '../language_rules.mjs';
import { loadLanguageCodes } from './load-vocab.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_FILE = path.join(HERE, 'language-profiles.json');
const BASELINE_FILE = path.join(HERE, 'language-profiles-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

// axis -> the feature ids / row flags in language_rules.mjs that count as
// "this need is on the books". An EMPTY list means no engine declaration
// exists yet for the behaviour — every language answering yes is a
// standing, owner-visible finding until one does (that is the point:
// classifiers stayed invisible for zh/ja/th/ko precisely because nothing
// ever asked).
const AXIS_EVIDENCE = {
  definiteArticles: ['indefiniteArticle'], // ARTICLE_LANGS drives both articles
  indefiniteArticles: ['indefiniteArticle'],
  nounCaseOnObjects: ['marksCaseOnDirectObjects'],
  prepositionalCase: ['marksCaseAfterPrepositions'],
  verbPersonConjugation: ['verbPersonParadigm'],
  verbGenderAgreement: ['verbGenderParadigm'],
  grammaticalGender: ['fullNounGender', 'nounGenderForCountables'],
  adjectiveAgreement: ['declinesAttributiveAdjectives'],
  classifiersOrCounters: [],
  topicOrCaseParticles: ['topicParticle', 'marksCaseOnDirectObjects'],
  zeroOrSuffixalCopula: ['zeroPresentCopula'],
  pluralInflection: ['inflectsNounPlural'],
  spacelessScript: ['spacelessJoin', 'spacelessTiles'],
  apocope: ['apocope'],
  politenessRegisters: [],
  numeralInteraction: ['numeralGovernment', 'numeralGenderAgreement'],
  specialPossession: ['possessiveSuffixes', 'possessivePlacement', 'existentialPossession'],
};
const AXES = Object.keys(AXIS_EVIDENCE);

const raw = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
const profiles = Object.fromEntries(
  Object.entries(raw).filter(([k]) => !k.startsWith('_')));
const langCodes = loadLanguageCodes();

const hard = [];
const findings = {}; // lang -> [axis, …]

// ── Hard shape checks ────────────────────────────────────────────────────
for (const lc of langCodes) {
  if (!profiles[lc]) {
    hard.push(`NO_PROFILE|${lc} — every shipped language must answer the questionnaire`);
  }
}
for (const [lc, profile] of Object.entries(profiles)) {
  if (!langCodes.includes(lc)) {
    hard.push(`STALE_PROFILE|${lc} — profile for a language the app does not ship`);
    continue;
  }
  for (const axis of AXES) {
    if (typeof profile[axis] !== 'boolean') {
      hard.push(`MISSING_AXIS|${lc}|${axis} — the questionnaire has no skippable questions`);
    }
  }
  for (const axis of Object.keys(profile)) {
    if (!AXIS_EVIDENCE[axis]) {
      hard.push(`UNKNOWN_AXIS|${lc}|${axis} — not a questionnaire axis`);
    }
  }
}

// ── Evidence check: every true axis must be on the books ─────────────────
function hasEvidence(lc, axis) {
  const row = LANGUAGE_RULES[lc] || {};
  const features = row.features || {};
  return AXIS_EVIDENCE[axis].some((id) => !!features[id] || !!row[id]);
}

for (const [lc, profile] of Object.entries(profiles)) {
  if (!langCodes.includes(lc)) continue;
  for (const axis of AXES) {
    if (profile[axis] === true && !hasEvidence(lc, axis)) {
      (findings[lc] ??= []).push(axis);
    }
  }
}
for (const lc of Object.keys(findings)) findings[lc].sort();

if (hard.length) {
  console.error(`validate-language-profiles: ${hard.length} HARD failure(s) (never baselined):`);
  for (const h of hard) console.error('  ' + h);
  process.exit(1);
}

const total = Object.values(findings).reduce((n, a) => n + a.length, 0);
console.log(`Language profiles: ${Object.keys(profiles).length} profiles · ` +
  `${total} true axis(es) not yet on the books`,
  total ? findings : '');

if (UPDATE) {
  // Per-language keying: a language present with [] is verified-clean; a
  // language ABSENT is new and gets no baselined debt.
  const out = {};
  for (const lc of Object.keys(profiles).sort()) {
    if (!langCodes.includes(lc)) continue;
    out[lc] = findings[lc] || [];
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`Baseline updated -> ${path.relative(process.cwd(), BASELINE_FILE)}`);
  process.exit(0);
}

let baseline = {};
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }

const failures = [];
for (const [lc, axes] of Object.entries(findings)) {
  const known = baseline[lc];
  if (known === undefined) {
    // NEW language — no baselined debt allowed.
    for (const axis of axes) {
      failures.push(`${lc}|${axis} — NEW language: a true axis must be declared ` +
        '(feature or flag in language_rules.mjs) before it ships, not baselined');
    }
    continue;
  }
  for (const axis of axes) {
    if (!known.includes(axis)) {
      failures.push(`${lc}|${axis} — new questionnaire gap (not in baseline)`);
    }
  }
}
const fixed = [];
for (const [lc, axes] of Object.entries(baseline)) {
  for (const axis of axes) {
    if (!(findings[lc] || []).includes(axis)) fixed.push(`${lc}|${axis}`);
  }
}

console.log(`Baseline: ${Object.keys(baseline).length} language(s) · new: ${failures.length} · fixed (removable): ${fixed.length}`);
if (failures.length) {
  console.error('\nNEW questionnaire gaps (fail) — a language needs something nothing declares:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
if (fixed.length) {
  console.log('Fixed gaps — prune with: npm run validate:profiles:update');
}
console.log('No new questionnaire gaps. PASS.');
