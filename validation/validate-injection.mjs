#!/usr/bin/env node
// validate-injection.mjs
// The regression net for the MODIFIER-INJECTION paths — the code the other
// sentence validators deliberately never exercise (they run with rng pinned
// high so no adjective/number is injected, because injected sentences have
// no authored ground truth to compare against).
//
// In the real app injection runs with live rng, so a broken splice ships
// silently: this is where «tre acqua buone» (numbers on an explicit mass
// noun), «tre colazione» (missing plural data), หนังสือสามเล่มดี (Thai
// adjective after the quantifier) and stray spaces in spaceless scripts all
// lived. There is no authored render to diff against, so this validator
// checks structural INVARIANTS instead:
//
//   A. MASS_MODIFIER — a noun explicitly marked countable:false must never
//      accept adjective/number injection, in ANY language (gender data added
//      for article/agreement must not re-open it).
//   B. NO_PLURAL_DATA — in a language with plural morphology, a countable
//      noun that injection can quantify must have a plural distinct from its
//      singular (or be flagged pluralOnly/invariantPlural) — otherwise
//      "three breakfast" class output ships.
//   C. Forced-injection render lints, per template × language × one
//      compatible adjective and one number:
//        - BLANK_LOST: the surface the engine says it rendered for the
//          forced modifier (the L3 blank contract) must appear in the
//          sentence — catches splice corruption.
//        - SCRIPT_SPACE: spaceless scripts (th/ja/zh) must contain no space
//          between native characters.
//        - LINT: double spaces, leaked CONCEPT_IDs, empty output, th
//          terminal punctuation.
//
// Ratcheted via validation/injection-baseline.json: pre-existing findings
// don't fail, NEW ones do. Refresh deliberately with --update-baseline.
//
// Run:  node validation/validate-injection.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import { configureEngine, buildSentence, isModifierCompatible } from '../sentence_engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_FILE = path.join(HERE, 'injection-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();

configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  // High rng: RANDOM injection stays off; we exercise injection
  // deterministically through the forcedConcept mechanism instead.
  rng: () => 0.999,
});

// Languages whose countable nouns inflect for number.
const PLURAL_LANGS = new Set(['en', 'pt', 'es', 'fr', 'de', 'el', 'no', 'it', 'uk', 'ar', 'tr']);
// Scripts written without inter-word spaces.
const SPACELESS = {
  th: /[฀-๿]\s+[฀-๿]/,
  ja: /[぀-ヿ一-鿿]\s+[぀-ヿ一-鿿]/,
  zh: /[一-鿿]\s+[一-鿿]/,
};

const findings = [];
const add = (key, detail) => findings.push({ key, detail });

const concepts = vocab.concepts;
const allIds = Object.keys(concepts);
const massNouns = allIds.filter((c) => concepts[c].type === 'noun' && concepts[c].countable === false);
const sampleAdjectives = allIds.filter((c) => concepts[c].type === 'adjective' &&
  concepts[c].semantic_role !== 'possessive');
const TWO = 'TWO';

// ── A. mass nouns reject modifiers in every language ─────────────────────────
for (const lang of langCodes) {
  for (const noun of massNouns) {
    if (isModifierCompatible(lang, TWO, noun)) {
      add(`MASS_MODIFIER|${lang}|${noun}`, `countable:false noun accepts number injection in ${lang}`);
    }
  }
}

// ── B. quantifiable nouns carry plural data where the language needs it ──────
const quantifiable = new Set();
for (const tpl of templates) {
  for (const c of tpl.concepts || []) {
    if (concepts[c]?.type === 'noun' && concepts[c]?.countable !== false) quantifiable.add(c);
  }
}
for (const lang of [...PLURAL_LANGS].filter((l) => langCodes.includes(l))) {
  for (const noun of quantifiable) {
    if (!isModifierCompatible(lang, TWO, noun)) continue;
    const entry = vocab.languages?.[lang]?.forms?.[noun];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (entry.pluralOnly || entry.invariantPlural) continue;
    if (!entry.plural || entry.plural === entry.form) {
      // en pluralizes by rule; only data languages need explicit plurals.
      if (lang === 'en') continue;
      add(`NO_PLURAL_DATA|${lang}|${noun}`, `number injection possible but no plural form ("${entry.form}")`);
    }
  }
}

// ── C. forced-injection render invariants ────────────────────────────────────
// Structures where a space is legitimate in a spaceless script (clause
// boundaries in Thai complex sentences, authored fixed-form renders).
const SPACE_OK_STRUCTURES = new Set([
  'complex_clause', 'question', 'direction', 'selection', 'response',
  'politeness', 'modality', 'evaluation', 'time_statement', 'time_relation',
]);

const lint = (lang, id, kind, sentence, tpl) => {
  if (!sentence || !sentence.trim()) { add(`EMPTY|${lang}|${id}|${kind}`, 'empty sentence'); return; }
  if (/\s{2,}/.test(sentence)) add(`LINT|${lang}|${id}|${kind}|doublespace`, JSON.stringify(sentence));
  // A true leak is a token that IS a concept id with no form in this
  // language — legitimate Latin loanwords ("NPC") have a form and pass.
  for (const m of sentence.matchAll(/\b[A-Z][A-Z_]{2,}\b/g)) {
    const tok = m[0];
    if (concepts[tok] && !vocab.languages?.[lang]?.forms?.[tok]) {
      add(`LEAK|${lang}|${id}|${kind}|${tok}`, sentence);
    }
  }
  if (SPACELESS[lang] && SPACELESS[lang].test(sentence) &&
      !SPACE_OK_STRUCTURES.has(tpl.structure?.type)) {
    add(`SCRIPT_SPACE|${lang}|${id}|${kind}`, sentence);
  }
  if (lang === 'th' && /[.?!]$/.test(sentence)) add(`LINT|th|${id}|${kind}|punct`, sentence);
};

for (const tpl of templates) {
  const nouns = (tpl.concepts || []).filter((c) => concepts[c]?.type === 'noun');
  if (!nouns.length) continue;
  const id = tpl.template_id || '(no id)';
  for (const lang of langCodes) {
    // one compatible adjective + the number TWO, forced deterministically
    const noun = nouns[0];
    const adj = sampleAdjectives.find((a) => isModifierCompatible(lang, a, noun));
    for (const [kind, forced] of [['adj', adj], ['num', isModifierCompatible(lang, TWO, noun) ? TWO : null]]) {
      if (!forced) continue;
      const shared = {};
      let sentence;
      try {
        sentence = buildSentence(lang, tpl, forced, shared);
      } catch (e) {
        add(`THREW|${lang}|${id}|${kind}`, e.message);
        continue;
      }
      lint(lang, id, kind, sentence, tpl);
      // The L3 blank contract: the surface recorded for the forced modifier
      // must be findable in the sentence.
      const surface = shared[`blankSurface_${lang}`];
      if (surface && !sentence.toLowerCase().includes(String(surface).toLowerCase())) {
        add(`BLANK_LOST|${lang}|${id}|${kind}`, `"${surface}" not in "${sentence}"`);
      }
    }
  }
}

// ── report + ratchet ─────────────────────────────────────────────────────────
const byType = {};
for (const f of findings) byType[f.key.split('|')[0]] = (byType[f.key.split('|')[0]] || 0) + 1;
console.log(`Injection invariants: ${findings.length} finding(s)`, byType);

if (UPDATE) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(findings.map((f) => f.key).sort(), null, 2) + '\n');
  console.log(`Baseline updated: ${findings.length} finding(s) written.`);
  process.exit(0);
}

let baseline = [];
try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { /* first run */ }
const known = new Set(baseline);
const fresh = findings.filter((f) => !known.has(f.key));
const fixed = baseline.filter((k) => !findings.some((f) => f.key === k));

console.log(`Baseline: ${known.size} known · new: ${fresh.length} · fixed (removable): ${fixed.length}`);
if (fresh.length) {
  console.error('\nNEW injection-path findings (the app renders these live even though');
  console.error('the authored-render validators never see them):\n');
  for (const f of fresh.slice(0, 30)) console.error(`  ${f.key}\n     ${f.detail}`);
  if (fresh.length > 30) console.error(`  … and ${fresh.length - 30} more`);
  console.error('\nFix the engine/data, or baseline deliberately with: npm run validate:injection:update');
  process.exit(1);
}
if (fixed.length) console.log('Some baselined findings are fixed — prune with npm run validate:injection:update.');
console.log('No new findings. PASS.');
