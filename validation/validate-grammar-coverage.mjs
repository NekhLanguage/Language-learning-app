#!/usr/bin/env node
// validate-grammar-coverage.mjs
// The grammar coverage matrix — turns "has a LANGUAGE_RULES row" into
// "has the RIGHT row". Emi's 2026-08-27 cross-language sweep found de, fr
// and es shipping systematic grammar defects that were all predictable
// from their thin rows: the old contract enforced that a row EXISTS, not
// that it is ADEQUATE (de shipped 3 flags; pl needs 8).
//
// Each language's row declares `features` — linguistic facts about what
// the language NEEDS. For every declared need this validator asserts an
// implementing rule (or agreement data) exists:
//
//   COVERAGE_GAP|<lang>|<feature> — the language needs the feature and
//     nothing implements it. Ratcheted: the baseline IS the owner-visible
//     list of known-broken grammar per language, pruned as fixes land.
//
// Two HARD failures (never baselined):
//   STALE_MATRIX|<lang>|<rule>   — an implementing flag is set with no
//     corresponding declared feature: the matrix no longer describes the
//     language and can't be trusted.
//   VERIFIED_REGRESSION|<lang>|… — a launch-verified language (pl, uk —
//     human-tested by QA) has a coverage gap. These must stay clean.
//
// Run:  node validation/validate-grammar-coverage.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGE_RULES } from '../language_rules.mjs';
import { loadVocab, loadLanguageCodes } from './load-vocab.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'grammar-coverage-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);

// Languages whose grammar a human QA pass has verified end-to-end. A
// coverage gap here is a regression, not a backlog item — hard fail.
const VERIFIED_LANGS = new Set(['pl', 'uk']);

// Core adjective concepts (broad, from adjectives.json) — the set the
// agreement-data check walks.
const CORE_ADJECTIVES = Object.keys(vocab.concepts).filter((cid) => {
  const m = vocab.concepts[cid];
  return m.type === 'adjective' && m.source === 'adjectives.json' &&
    m.semantic_role !== 'possessive';
});

// Does the language's adjective DATA implement gender agreement? Every
// core adjective must carry an `f` form (the minimum agreement axis).
// Array-shaped entries have no agreement fields at all.
function adjectiveAgreementData(lang) {
  const forms = vocab.languages?.[lang]?.forms || {};
  const missing = CORE_ADJECTIVES.filter((cid) => {
    const e = forms[cid];
    return !(e && !Array.isArray(e) && typeof e === 'object' && typeof e.f === 'string');
  });
  return { ok: missing.length === 0, missing };
}

// feature id -> does this row implement it? Returns true/false plus an
// optional detail string for the finding.
const FEATURE_CHECKS = {
  indefiniteArticle: (row) => ({ ok: !!row.indefiniteArticle }),
  marksCaseOnDirectObjects: (row) => ({
    ok: !!row.caseMarking?.directObjectCase ||
        row.caseMarking?.caseOn === 'determiner',
    detail: 'needs caseMarking.directObjectCase (or a determiner-case strategy)',
  }),
  marksCaseAfterPrepositions: (row) => ({
    ok: Object.keys(row.caseMarking?.prepositions || {}).length > 0,
    detail: 'needs caseMarking.prepositions',
  }),
  predicateNounCase: (row) => ({
    ok: !!row.caseMarking?.predicateNounCase,
    detail: 'needs caseMarking.predicateNounCase',
  }),
  declinesAttributiveAdjectives: (row, lang) => {
    if (row.adjectiveDeclension) return { ok: true };
    const { ok, missing } = adjectiveAgreementData(lang);
    return {
      ok,
      detail: ok ? '' :
        `no adjectiveDeclension strategy and ${missing.length} core adjective(s) lack an f form (${missing.slice(0, 5).join(', ')}…)`,
    };
  },
  adjectivePosition: (row, lang, value) => {
    if (value === 'pre') return { ok: !row.postNominalAdjectives,
      detail: 'declares pre-nominal but postNominalAdjectives is set' };
    if (value === 'post') return { ok: !!row.postNominalAdjectives,
      detail: 'needs postNominalAdjectives' };
    if (value === 'roleBased') return {
      ok: !!row.postNominalAdjectives &&
          Array.isArray(row.preNominalAdjectiveRoles) &&
          row.preNominalAdjectiveRoles.length > 0,
      detail: 'needs postNominalAdjectives + a non-empty preNominalAdjectiveRoles list',
    };
    return { ok: false, detail: `unknown adjectivePosition "${value}"` };
  },
  apocope: (row) => ({ ok: !!row.apocope, detail: 'needs the apocope rule' }),
  possessiveSuffixes: (row) => ({
    ok: !!row.possessiveSuffixes,
    detail: 'needs the possessiveSuffixes rule (suffix generator + possessed-map overrides)',
  }),
  copulaPersonAgreement: (row) => ({
    ok: !!row.copulaPersonSuffixes,
    detail: 'needs the copulaPersonSuffixes rule (personal endings, -DIr only 3sg)',
  }),
  possessivePlacement: (row, lang, value) => {
    if (value === 'enclitic') {
      return { ok: !!row.possessiveEnclitic,
        detail: 'needs the possessiveEnclitic rule' };
    }
    return { ok: false, detail: `unknown possessivePlacement "${value}"` };
  },
  numeralGenderAgreement: (row, lang) => {
    if (!row.numeralGenderAgreement) {
      return { ok: false, detail: 'needs the numeralGenderAgreement rule' };
    }
    // Data half: at least ONE must be object-shaped with a feminine form,
    // or the rule is declared over dead bare-array data.
    const one = vocab.languages?.[lang]?.forms?.ONE;
    const ok = !!one && typeof one === 'object' && !Array.isArray(one) &&
      typeof one.f === 'string';
    return { ok, detail: ok ? '' : 'ONE has no object entry with an f form' };
  },
  articleCaseMarking: (row) => ({
    ok: row.caseMarking?.caseOn === 'determiner',
    detail: 'needs caseMarking.caseOn: "determiner"',
  }),
  virilePlural: (row) => ({ ok: !!row.virilePlural }),
  numeralGovernment: (row) => ({ ok: !!row.numeralGenitivePlural,
    detail: 'needs numeralGenitivePlural' }),
  zeroPresentCopula: (row) => ({ ok: !!row.zeroPresentCopula }),
  definitenessAgreement: () => ({
    ok: false, // no engine mechanism exists yet — always a declared gap
    detail: 'no definiteness-agreement rule exists in the engine yet',
  }),
};

// implementing flag -> the feature that must declare the need (reverse
// direction: a rule with no feature means the matrix is stale).
const RULE_IMPLIES_FEATURE = [
  [(row) => !!row.indefiniteArticle, 'indefiniteArticle',
    (f) => !!f.indefiniteArticle],
  [(row) => !!row.caseMarking?.directObjectCase, 'marksCaseOnDirectObjects',
    (f) => !!f.marksCaseOnDirectObjects],
  [(row) => Object.keys(row.caseMarking?.prepositions || {}).length > 0,
    'marksCaseAfterPrepositions', (f) => !!f.marksCaseAfterPrepositions],
  [(row) => !!row.caseMarking?.predicateNounCase, 'predicateNounCase',
    (f) => !!f.predicateNounCase],
  [(row) => !!row.postNominalAdjectives, 'adjectivePosition post/roleBased',
    (f) => f.adjectivePosition === 'post' || f.adjectivePosition === 'roleBased'],
  [(row) => !!row.virilePlural, 'virilePlural', (f) => !!f.virilePlural],
  [(row) => !!row.numeralGenitivePlural, 'numeralGovernment',
    (f) => !!f.numeralGovernment],
  [(row) => !!row.zeroPresentCopula, 'zeroPresentCopula',
    (f) => !!f.zeroPresentCopula],
  [(row) => !!row.possessiveSuffixes, 'possessiveSuffixes',
    (f) => !!f.possessiveSuffixes],
  [(row) => !!row.copulaPersonSuffixes, 'copulaPersonAgreement',
    (f) => !!f.copulaPersonAgreement],
  [(row) => !!row.numeralGenderAgreement, 'numeralGenderAgreement',
    (f) => !!f.numeralGenderAgreement],
  [(row) => !!row.possessiveEnclitic, 'possessivePlacement enclitic',
    (f) => f.possessivePlacement === 'enclitic'],
];

const findings = [];
const hard = [];

for (const lang of langCodes) {
  const row = LANGUAGE_RULES[lang];
  if (!row) continue; // row completeness is the unit suite's contract
  const features = row.features;
  if (!features) {
    hard.push(`STALE_MATRIX|${lang}|no features block declared`);
    continue;
  }
  for (const [feature, value] of Object.entries(features)) {
    if (!value) continue;
    const check = FEATURE_CHECKS[feature];
    if (!check) {
      hard.push(`STALE_MATRIX|${lang}|unknown feature "${feature}"`);
      continue;
    }
    const { ok, detail } = check(row, lang, value);
    if (!ok) {
      const key = `COVERAGE_GAP|${lang}|${feature}`;
      if (VERIFIED_LANGS.has(lang)) {
        hard.push(`VERIFIED_REGRESSION|${lang}|${feature}|${detail || ''}`);
      } else {
        findings.push({ key, detail: detail || 'no implementing rule' });
      }
    }
  }
  for (const [ruleSet, featureName, featureDeclared] of RULE_IMPLIES_FEATURE) {
    if (ruleSet(row) && !featureDeclared(features)) {
      hard.push(`STALE_MATRIX|${lang}|rule implemented but feature not declared: ${featureName}`);
    }
  }
}

if (hard.length) {
  console.error(`validate-grammar-coverage: ${hard.length} HARD failure(s) (never baselined):`);
  for (const h of hard) console.error('  ' + h);
  process.exit(1);
}

const byLang = {};
for (const f of findings) {
  const l = f.key.split('|')[1];
  byLang[l] = (byLang[l] || 0) + 1;
}
console.log(`Grammar coverage: ${findings.length} declared-but-unimplemented feature(s)`,
  Object.keys(byLang).length ? byLang : '');

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE,
    JSON.stringify(findings.map((f) => f.key).sort(), null, 2) + '\n');
  console.log(`Baseline updated: ${findings.length} entries -> ${BASELINE_FILE}`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }
const known = new Set(baseline);
const fresh = findings.filter((f) => !known.has(f.key));
const fixed = baseline.filter((k) => !findings.some((f) => f.key === k));

console.log(`Baseline: ${baseline.length} known · new: ${fresh.length} · fixed (removable): ${fixed.length}`);
if (fresh.length) {
  console.error('\nNEW coverage gaps (fail) — a language needs a feature nothing implements:');
  for (const f of fresh) console.error(`  ${f.key}\n    ${f.detail}`);
  process.exit(1);
}
if (fixed.length) {
  console.log('Fixed gaps — prune with: npm run validate:coverage:update');
}
console.log('No new coverage gaps. PASS.');
