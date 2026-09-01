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
        row.caseMarking?.caseOn === 'determiner' ||
        !!row.nominalParticles?.object,
    detail: 'needs caseMarking.directObjectCase (or a determiner-case strategy, or an object particle)',
  }),
  topicParticle: (row) => ({
    ok: !!row.nominalParticles?.topic,
    detail: 'needs nominalParticles.topic',
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
    // Genderless case agreement (caseMarking.adjectiveAgreesWithCase —
    // fi): the data half is case fields on the core adjectives
    // (partitive + genitive, the object cases the corpus reaches).
    // Array-shaped entries (predicative-only words like «oikein») are
    // exempt — the engine's compat gate refuses them as attributive
    // modifiers, so they can never ship a bare nominative.
    if (row.caseMarking?.adjectiveAgreesWithCase) {
      const forms = vocab.languages?.[lang]?.forms || {};
      const missing = CORE_ADJECTIVES.filter((cid) => {
        const e = forms[cid];
        if (!e || Array.isArray(e) || typeof e !== 'object') return false;
        return typeof e.partitive !== 'string' || typeof e.genitive !== 'string';
      });
      return {
        ok: missing.length === 0,
        detail: missing.length ?
          `adjectiveAgreesWithCase declared but ${missing.length} core adjective(s) lack partitive/genitive (${missing.slice(0, 5).join(', ')}…)` : '',
      };
    }
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
    // tr: the HAVE-construction suffix generator. fi: the 3rd-person
    // reflexive suffix rule (possessed3 data + drill refusal) — the
    // meaning-critical subset; 1st/2nd person keep the colloquial free
    // pronoun by explicit pedagogy call (Nekh 2026-08-28).
    ok: !!row.possessiveSuffixes || !!row.reflexivePossessiveSuffix,
    detail: 'needs the possessiveSuffixes rule (suffix generator + possessed-map overrides) or reflexivePossessiveSuffix',
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
  classifiersOrCounters: (row, lang) => {
    // zh-style classifiers (numeral+CL+noun, 一+CL for "a") or ko-style
    // counters (noun + numeral + counter). Data half: at least one noun
    // must carry the per-noun field, or the rule runs on the default only.
    const field = row.classifiers ? 'classifier' :
      (row.counters || row.counterPrefix) ? 'counter' : null;
    if (!field) {
      return { ok: false,
        detail: 'needs the classifiers (zh), counters (ko), or counterPrefix (ja) rule' };
    }
    const forms = vocab.languages?.[lang]?.forms || {};
    const any = Object.values(forms).some((e) => e && !Array.isArray(e) &&
      typeof e === 'object' && typeof e[field] === 'string');
    return { ok: any,
      detail: any ? '' : `rule declared but no noun carries a ${field} field` };
  },
  articleCaseMarking: (row) => ({
    ok: row.caseMarking?.caseOn === 'determiner',
    detail: 'needs caseMarking.caseOn: "determiner"',
  }),
  virilePlural: (row) => ({ ok: !!row.virilePlural }),
  numeralGovernment: (row) => ({
    ok: !!row.numeralGenitivePlural || !!row.numeralPartitiveSingular,
    detail: 'needs numeralGenitivePlural (pl/uk 5+) or numeralPartitiveSingular (fi ≥2)' }),
  zeroPresentCopula: (row) => ({ ok: !!row.zeroPresentCopula }),
  negatorAgreement: (row, lang) => {
    if (!row.conjugatingNegator) {
      return { ok: false, detail: 'needs the conjugatingNegator rule' };
    }
    // Data half: the NOT entry must carry a person paradigm, or the rule
    // is declared over an invariant bare-array negator.
    const not = vocab.languages?.[lang]?.forms?.NOT;
    const ok = !!not && typeof not === 'object' && !Array.isArray(not) &&
      typeof not['1_plural'] === 'string';
    return { ok, detail: ok ? '' : 'NOT has no person-paradigm entry' };
  },
  definitenessAgreement: () => ({
    ok: false, // no engine mechanism exists yet — always a declared gap
    detail: 'no definiteness-agreement rule exists in the engine yet',
  }),
  locativeCopula: (row) => ({
    ok: typeof row.locativeCopula === 'string' && row.locativeCopula.length > 0,
    detail: 'needs the locativeCopula rule (string surface — zh «在», th «อยู่»)',
  }),
  postposedAdpositions: (row) => ({
    ok: !!row.postposedAdpositions,
    detail: 'needs the postposedAdpositions rule',
  }),
  predicateColorNominalizer: (row) => ({
    ok: typeof row.colorPredicateSuffix === 'string' && row.colorPredicateSuffix.length > 0,
    detail: 'needs the colorPredicateSuffix rule (string appended to color root in predicate position — zh «色的»)',
  }),
  comitativeBeforeVerb: (row) => ({
    ok: typeof row.comitativeBeforeVerb === 'string' && row.comitativeBeforeVerb.length > 0,
    detail: 'needs the comitativeBeforeVerb rule (linker string between comitative phrase and verb — zh «一起»)',
  }),
  postposedNumerals: (row) => ({
    ok: Array.isArray(row.postposedNumerals) && row.postposedNumerals.length > 0,
    detail: 'needs the postposedNumerals rule (array of numeric CIDs that follow the noun as appositive — ar ["ONE"])',
  }),
  verbGenderParadigm: (row, lang) => {
    if (!row.verbGenderParadigm) {
      return { ok: false, detail: 'needs the verbGenderParadigm rule' };
    }
    // Data half: at least one core verb must carry `3_singular_feminine`
    // (or the rule is declared over data that never fills it).
    const forms = vocab.languages?.[lang]?.forms || {};
    const coreVerbs = Object.keys(vocab.concepts).filter((cid) => {
      const m = vocab.concepts[cid];
      return m && m.type === 'verb' && m.source === 'verbs.json';
    });
    const authored = coreVerbs.filter((cid) => {
      const e = forms[cid];
      return e && typeof e === 'object' && !Array.isArray(e) &&
        typeof e['3_singular_feminine'] === 'string';
    });
    return {
      ok: authored.length > 0,
      detail: authored.length ? '' :
        'no core verb carries a 3_singular_feminine form',
    };
  },
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
  [(row) => !!row.numeralPartitiveSingular, 'numeralGovernment',
    (f) => !!f.numeralGovernment],
  [(row) => !!row.zeroPresentCopula, 'zeroPresentCopula',
    (f) => !!f.zeroPresentCopula],
  [(row) => !!row.possessiveSuffixes, 'possessiveSuffixes',
    (f) => !!f.possessiveSuffixes],
  [(row) => !!row.reflexivePossessiveSuffix, 'possessiveSuffixes',
    (f) => !!f.possessiveSuffixes],
  [(row) => !!row.conjugatingNegator, 'negatorAgreement',
    (f) => !!f.negatorAgreement],
  [(row) => !!row.caseMarking?.adjectiveAgreesWithCase,
    'declinesAttributiveAdjectives',
    (f) => !!f.declinesAttributiveAdjectives],
  [(row) => !!row.copulaPersonSuffixes, 'copulaPersonAgreement',
    (f) => !!f.copulaPersonAgreement],
  [(row) => !!row.numeralGenderAgreement, 'numeralGenderAgreement',
    (f) => !!f.numeralGenderAgreement],
  [(row) => !!row.possessiveEnclitic, 'possessivePlacement enclitic',
    (f) => f.possessivePlacement === 'enclitic'],
  [(row) => !!row.nominalParticles?.topic, 'topicParticle',
    (f) => !!f.topicParticle],
  [(row) => !!row.nominalParticles?.object, 'marksCaseOnDirectObjects',
    (f) => !!f.marksCaseOnDirectObjects],
  [(row) => !!row.copulaSuffix, 'zeroPresentCopula',
    (f) => !!f.zeroPresentCopula],
  [(row) => !!row.verbGenderParadigm, 'verbGenderParadigm',
    (f) => !!f.verbGenderParadigm],
  [(row) => !!row.classifiers || !!row.counters || !!row.counterPrefix,
    'classifiersOrCounters',
    (f) => !!f.classifiersOrCounters],
  [(row) => typeof row.locativeCopula === 'string' && row.locativeCopula.length > 0,
    'locativeCopula',
    (f) => !!f.locativeCopula],
  [(row) => !!row.postposedAdpositions, 'postposedAdpositions',
    (f) => !!f.postposedAdpositions],
  [(row) => typeof row.colorPredicateSuffix === 'string' && row.colorPredicateSuffix.length > 0,
    'predicateColorNominalizer',
    (f) => !!f.predicateColorNominalizer],
  [(row) => typeof row.comitativeBeforeVerb === 'string' && row.comitativeBeforeVerb.length > 0,
    'comitativeBeforeVerb',
    (f) => !!f.comitativeBeforeVerb],
  [(row) => Array.isArray(row.postposedNumerals) && row.postposedNumerals.length > 0,
    'postposedNumerals',
    (f) => !!f.postposedNumerals],
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
