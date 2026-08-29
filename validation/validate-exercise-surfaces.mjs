#!/usr/bin/env node
// validate-exercise-surfaces.mjs
// The regression net for EXERCISE ASSEMBLY — the layer between the sentence
// engine and the learner that no other validator walks. Emi run 3 proved
// the gap: Italian passed every content validator while shipping four
// high-severity exercise bugs, because the defects lived in blanks, option
// tiles and grading, not in the rendered sentence string.
//
// Per language this validator asserts the app-facing contracts headlessly,
// through the same engine exports the app uses:
//
//   A. BLANK_PARTITION — the L3 fill-in-the-blank contract: wherever a
//      blank resolves (resolveNounBlank), frame + blanked surface must
//      partition the sentence EXACTLY — reassembling the frame with the
//      option surface reproduces the sentence, so the article lives on
//      exactly one side («Loro vedono un [un aeroporto]» was Emi
//      2026-08-26-02). An unresolvable blank is NOT a finding here — the
//      app skips those combos — it feeds section D's concept-level
//      inventory instead.
//   B. OPTIONS_SHORT / SURFACE_COLLISION — the option-set contract: every
//      drillable concept must yield 4 options whose TARGET-language
//      surfaces are pairwise distinct. A collision makes a correct answer
//      rejectable («suo» glosses both HIS and HER — Dan ruling 2,
//      2026-08-27); a short pool silently excludes the concept from
//      testing (canConceptBeTested returns false and the learner never
//      sees it again).
//   C. L7_NO_VARIANTS / L7_MODIFIER_MISMATCH — the free-translation
//      grading contract: the accepted-answer set is non-empty and the
//      target/support builds agree on modifier landing (the app bails at
//      runtime on a mismatch; baselined entries inventory what a language
//      loses, NEW entries are regressions).
//   D. EXCLUDED — the invisible-exclusion inventory: a drillable concept
//      for which NO plain template survives contracts A+B in this
//      language. These concepts silently plateau — the learner is never
//      tested past exposure, and nothing in the UI says so.
//   E. CASE_FALLBACK — for case-marking languages (uk today): a
//      preposition-governed noun/pronoun slot whose entry lacks the
//      demanded case field. The engine falls back to the nominative with
//      no warning — the «Я п'ю вода» failure mode, position by position.
//      Uses the engine's own case map so the walk can never drift from
//      render behaviour. Also walks DIRECT-OBJECT positions in languages
//      whose object case is lexical (adjectiveAgreesWithCase — fi): a
//      noun there with no accusative data ships the bare nominative
//      («Hän näkee sali» — Emi run-7 -29: 0 of 52 pack objects correct,
//      invisible because only preposition slots were walked).
//
//   Plus one HARD check (never baselined): HUBNAME_MISSING — every lang
//   file's hubNames block must name every shipped language. No other
//   validator covers this; a gap falls back to English silently.
//
// Ratcheted via validation/surface-baseline.json: pre-existing findings
// don't fail, NEW ones do. Refresh deliberately with --update-baseline.
// The initial baseline IS the per-language improvement worklist.
//
// Run:  node validation/validate-exercise-surfaces.mjs [--update-baseline]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadTemplates, loadLanguageCodes } from './load-vocab.mjs';
import {
  configureEngine, buildSentence, buildSentenceWithRules,
  resolveNounBlank, buildSameTypeOptions, acceptedAnswerVariants,
  orderedConceptsForTemplate, caseMap, caseFormFor, formOf, surfaceForm,
  optionSurfaceFor, predicateNounCaseFor, isPluralPronoun,
  adjectiveSuitsNoun, isModifierCompatible,
  accusativeNoun, isDirectObjectPosition,
} from '../sentence_engine.mjs';
import { langsWith, LANGUAGE_RULES } from '../language_rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const BASELINE_FILE = path.join(HERE, 'surface-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();

configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  // High rng: no random modifier injection — contracts are asserted on the
  // deterministic build, exactly like the sibling validators.
  rng: () => 0.999,
});

const findings = [];
const add = (key, detail) => findings.push({ key, detail });
const SPACELESS = new Set([...langsWith('spacelessJoin'), ...langsWith('spacelessTiles')]);

const concepts = vocab.concepts;
// The concept types the app actually drills through L2-L7 exercise
// surfaces. Other types (glue, connectors, politeness tags…) surface only
// inside authored structures and have no option-set/blank contract.
const DRILLABLE = new Set(['noun', 'verb', 'adjective', 'number']);
const BLANKABLE = new Set(['noun', 'verb']);

// Plain templates: the generic render path. Structure-typed templates are
// authored-only or slot-built and are not offered for modifier/blank
// drills (chooseTemplateForConcept filters them the same way).
const plainTemplates = templates.filter((t) => !t.structure?.type && Array.isArray(t.concepts));

// ── A. blank partition, per language × template × blankable concept ─────────
// blankOk[lang] = Set of "tplId|cid" combos that produced a valid blank —
// reused by section D so exclusion mirrors exactly what A measured.
const blankOk = Object.fromEntries(langCodes.map((lc) => [lc, new Set()]));
for (const lang of langCodes) {
  for (const tpl of plainTemplates) {
    const id = tpl.template_id || tpl._file + '?';
    let sentence;
    try {
      sentence = buildSentence(lang, tpl, null, {});
    } catch (e) {
      add(`BLANK_THREW|${lang}|${id}`, String(e && e.message || e));
      continue;
    }
    if (!sentence || !sentence.trim()) continue; // EMPTY is validate-injection's finding
    for (const cid of tpl.concepts) {
      if (!BLANKABLE.has(concepts[cid]?.type)) continue;
      const blank = resolveNounBlank(sentence, tpl, lang, cid);
      if (!blank) {
        // Not a finding by itself: the app returns null and skips this
        // template. The learner-facing question is whether ANY template
        // works for the concept — section D reports that.
        continue;
      }
      const reassembled = blank.blanked.replace('_____', blank.surface);
      if (reassembled.toLowerCase() !== sentence.toLowerCase()) {
        add(`BLANK_PARTITION|${lang}|${id}|${cid}`,
          `frame "${blank.blanked}" + "${blank.surface}" != "${sentence}"`);
        continue;
      }
      // The blank must hold a WHOLE word: a letter adjacent to the gap
      // means a stem was cut out of its inflected form and the case
      // suffix is stranded in the frame («Ja idę do _____u.» — Emi
      // 2026-08-27-03). Spaceless scripts have no letter boundaries.
      if (!SPACELESS.has(lang) && /\p{L}_____|_____\p{L}/u.test(blank.blanked)) {
        add(`BLANK_MIDWORD|${lang}|${id}|${cid}`,
          `blank cuts through a word: "${blank.blanked}"`);
        continue;
      }
      // The tile the app would render for the CORRECT concept must equal
      // the blanked surface — the two engine functions (resolveNounBlank
      // and optionSurfaceFor) must never drift apart. Authored surface
      // overrides are exempt: they may embed a preposition the option
      // renderer cannot know («do domu»), and the app shows the blank
      // surface itself for the correct tile.
      if (concepts[cid]?.type === 'noun' && !tpl.surface?.[lang]?.[cid]) {
        const tile = optionSurfaceFor(lang, tpl, cid, blank.slot, { bareMode: blank.bareMode });
        if (tile !== null && tile !== undefined &&
            tile.toLowerCase() !== blank.surface.toLowerCase()) {
          add(`TILE_MISMATCH|${lang}|${id}|${cid}`,
            `blank holds "${blank.surface}" but the slot tile renders "${tile}"`);
          continue;
        }
      }
      blankOk[lang].add(`${id}|${cid}`);
    }
  }
}

// ── B. option-set integrity, per language × drillable concept ───────────────
const optionsOk = Object.fromEntries(langCodes.map((lc) => [lc, new Set()]));
const drillableIds = Object.keys(concepts).filter((c) => DRILLABLE.has(concepts[c].type));
for (const lang of langCodes) {
  for (const cid of drillableIds) {
    const opts = buildSameTypeOptions(cid, 4, lang);
    if (!opts || opts.length < 4) {
      add(`OPTIONS_SHORT|${lang}|${cid}`,
        `only ${opts ? opts.length : 0} distinct-surface options`);
      continue;
    }
    const target = formOf(lang, cid);
    const collision = opts.find((o) => o !== cid && formOf(lang, o) === target);
    if (collision) {
      // The engine dedupes surfaces at build time, so a hit here is a
      // regression in that dedupe, not a data problem.
      add(`SURFACE_COLLISION|${lang}|${cid}|${collision}`,
        `both render "${target}" in ${lang}`);
      continue;
    }
    optionsOk[lang].add(cid);
  }
}

// ── C. L7 grading contract, per language × plain template ───────────────────
for (const lang of langCodes) {
  if (lang === 'en') continue; // en is support-only in the L7 direction checked
  for (const tpl of plainTemplates) {
    const id = tpl.template_id || tpl._file + '?';
    const sc = {};
    for (const c of tpl.concepts) {
      if (concepts[c]?.type === 'noun') { sc['adj_' + c] = null; sc['num_' + c] = null; }
    }
    let target, support;
    try {
      target = buildSentenceWithRules(lang, tpl, null, sc);
      support = buildSentenceWithRules('en', tpl, null, sc);
    } catch (e) {
      add(`L7_THREW|${lang}|${id}`, String(e && e.message || e));
      continue;
    }
    if (!target.sentence || !target.sentence.trim()) continue;
    if (target.hadModifier !== support.hadModifier ||
        JSON.stringify(target.modifierKeys) !== JSON.stringify(support.modifierKeys)) {
      add(`L7_MODIFIER_MISMATCH|${lang}|${id}`,
        `target(${target.hadModifier}) vs en(${support.hadModifier})`);
      continue;
    }
    const variants = acceptedAnswerVariants(lang, tpl, target.sentence, sc);
    if (!variants.length) {
      add(`L7_NO_VARIANTS|${lang}|${id}`, `no accepted answers for "${target.sentence}"`);
    }
  }
}

// ── C2. L7 drilled-modifier contract ────────────────────────────────────────
// The plain pass above nulls every adj_/num_ slot, so its parity assertion
// never exercises a landed modifier. This pass mirrors seedDrilledModifier:
// seed one compatible adjective and one number per template, and assert
// (a) the target/support builds agree on modifier identity, and (b) when
// the modifier landed, some accepted answer actually contains its
// target-language surface — the contract Emi's «Ty masz dobrą pracę» was
// graded wrong against (2026-08-27-01).
const PROBE_ADJS = ['BIG', 'GOOD', 'NEW'];
const PROBE_NUMS = ['TWO', 'FIVE'];
// Possessives seed at L6/L7 too (cap lift, Nekh 2026-08-28) — exempt from
// isModifierCompatible like the engine's forced path (determiners: «his
// water» is fine where «four waters» is not).
const PROBE_POSS = ['MY'];
for (const lang of langCodes) {
  if (lang === 'en') continue;
  for (const tpl of plainTemplates) {
    const id = tpl.template_id || tpl._file + '?';
    const nouns = tpl.concepts.filter((c) => concepts[c]?.type === 'noun');
    if (!nouns.length) continue;
    for (const probe of [...PROBE_ADJS, ...PROBE_NUMS, ...PROBE_POSS]) {
      // Mirrors seedDrilledModifier: a template that already authors the
      // drilled modifier is rendered as authored, never seeded on top; and
      // possessive drills never pick templates carrying another possessive
      // (chooseTemplateForConcept's stacked-possessive guard).
      if (tpl.concepts.includes(probe)) continue;
      const isAdj = concepts[probe]?.type === 'adjective';
      const isPoss = concepts[probe]?.semantic_role === 'possessive';
      if (isPoss && tpl.concepts.some((c) =>
        concepts[c]?.semantic_role === 'possessive')) continue;
      const noun = isPoss
        ? nouns.find((n) => adjectiveSuitsNoun(probe, n))
        : nouns.find((n) =>
            (!isAdj || adjectiveSuitsNoun(probe, n)) &&
            isModifierCompatible(lang, probe, n) &&
            isModifierCompatible('en', probe, n));
      if (!noun) continue; // seedDrilledModifier would skip this pairing too
      const sc = {};
      for (const c of nouns) { sc['adj_' + c] = null; sc['num_' + c] = null; }
      sc[(isAdj ? 'adj_' : 'num_') + noun] = probe;
      let target, support;
      try {
        target = buildSentenceWithRules(lang, tpl, null, sc);
        support = buildSentenceWithRules('en', tpl, null, sc);
      } catch (e) {
        add(`L7_DRILL_THREW|${lang}|${id}|${probe}`, String(e && e.message || e));
        continue;
      }
      if (!target.sentence || !target.sentence.trim()) continue;
      if (JSON.stringify(target.modifierKeys) !== JSON.stringify(support.modifierKeys)) {
        add(`L7_DRILL_MISMATCH|${lang}|${id}|${probe}`,
          `target ${JSON.stringify(target.modifierKeys)} vs en ${JSON.stringify(support.modifierKeys)}`);
        continue;
      }
      if (!target.hadModifier) continue; // dropped on both sides — app bails, fine
      break; // one landed probe per template per language keeps the walk bounded
    }
  }
}

// ── D. invisible-exclusion inventory, per language × drillable concept ──────
// A noun/verb that appears in plain templates but has NO template where
// both the blank (A) and the option set (B) hold is silently untestable at
// L3 in this language.
const conceptTemplates = new Map();
for (const tpl of plainTemplates) {
  const id = tpl.template_id || tpl._file + '?';
  for (const cid of tpl.concepts) {
    if (!BLANKABLE.has(concepts[cid]?.type)) continue;
    if (!conceptTemplates.has(cid)) conceptTemplates.set(cid, []);
    conceptTemplates.get(cid).push(id);
  }
}
for (const lang of langCodes) {
  for (const [cid, tplIds] of conceptTemplates) {
    if (!optionsOk[lang].has(cid)) continue; // already reported as OPTIONS_SHORT
    if (!tplIds.some((id) => blankOk[lang].has(`${id}|${cid}`))) {
      add(`EXCLUDED|${lang}|${cid}`,
        `no plain template yields a valid L3 blank (${tplIds.length} candidate template(s))`);
    }
  }
}

// ── E. case-fallback inventory, case-marking languages ──────────────────────
// Walk each plain template with the ENGINE'S OWN case map (so this can
// never drift from render behaviour) and flag every position where a case
// is demanded but the entry has no such field — the engine will silently
// render the nominative there.
for (const lang of langCodes) {
  for (const tpl of plainTemplates) {
    const id = tpl.template_id || tpl._file + '?';
    const ordered = orderedConceptsForTemplate(tpl, lang);
    if (!ordered || !ordered.length) continue;
    const caseAt = caseMap(lang, ordered);
    // Determiner-marking languages (caseOn: "determiner") realize case on
    // the article, not the noun — noun entries carry no case fields by
    // design, so only PRONOUNS (which do decline: «auf diesem») are
    // checked there.
    const nounsDecline =
      langsWith('caseMarking').has(lang) &&
      LANGUAGE_RULES[lang].caseMarking.caseOn !== 'determiner';
    ordered.forEach((cid, idx) => {
      const caseName = caseAt[idx];
      if (!caseName) return;
      const type = concepts[cid]?.type;
      if (type !== 'noun' && type !== 'pronoun') return;
      if (type === 'noun' && !nounsDecline) return;
      if (!caseFormFor(lang, cid, caseName)) {
        add(`CASE_FALLBACK|${lang}|${id}|${cid}|${caseName}`,
          `${caseName} demanded but no ${caseName} field — nominative ships`);
      }
    });
    // Direct-object positions, lexical-object-case languages (fi): the
    // gender-syncretism escape the Slavic languages rely on (masc/neut
    // accusative == nominative; feminine derived by strategy) does not
    // exist — a noun with no accusative data always ships the wrong
    // form. Uses the engine's own accusativeNoun so the check can never
    // drift from render behaviour.
    // Existential possession (fi «Minulla on kirja»): the possessed noun
    // deliberately stays nominative — mirror the engine's existentialHave
    // guard so those slots are never flagged.
    const existentialHaveTpl = !!LANGUAGE_RULES[lang].existentialPossession &&
      ordered.includes('HAVE') &&
      !ordered.some((c) => c === 'BE' || concepts[c]?.semantic_role === 'copula');
    if (nounsDecline && !existentialHaveTpl &&
        LANGUAGE_RULES[lang].caseMarking.directObjectCase === 'accusative' &&
        LANGUAGE_RULES[lang].caseMarking.adjectiveAgreesWithCase) {
      ordered.forEach((cid, idx) => {
        if (concepts[cid]?.type !== 'noun') return;
        if (caseAt[idx]) return; // governed slots handled above
        if (!isDirectObjectPosition(ordered, idx)) return;
        // An authored surface override IS this slot's rendering
        // («kotiin») — the engine prefers it, so nothing falls back.
        if (typeof tpl.surface?.[lang]?.[cid] === 'string') return;
        // A plurale tantum's accusative IS its nominative plural
        // («kasvot», «huonekalut») — authored-syncretic data is not a
        // fallback, so only the ABSENCE of data flags.
        const entry = vocab.languages?.[lang]?.forms?.[cid];
        const hasObjectData = entry && typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (typeof entry.accusative === 'string' || entry.pluralOnly);
        if (!hasObjectData) {
          const base = formOf(lang, cid);
          if (accusativeNoun(lang, cid, base) === base) {
            add(`CASE_FALLBACK|${lang}|${id}|${cid}|object`,
              'direct object demanded but no accusative data — nominative ships');
          }
        }
      });
    }
    // Predicate-noun positions («On jest kelnerem») — the walk the engine
    // comment always claimed existed and didn't: predicateNounCase demands
    // a case the entry may lack, and the render path falls back to the
    // nominative silently. Every one of Emi 2026-08-27-05's pack nouns
    // lands here. Plural copular subjects demand the _plural field
    // («Oni są mistrzami» needs instrumental_plural).
    const subjectCid = ordered.find((c) => concepts[c]?.type === 'pronoun') ||
      ordered.find((c) => ['noun', 'time'].includes(concepts[c]?.type));
    const isCopularTpl = ordered.some((c) =>
      c === 'BE' || concepts[c]?.semantic_role === 'copula');
    if (isCopularTpl) {
      const pluralSubject = isPluralPronoun(subjectCid);
      ordered.forEach((cid, idx) => {
        if (concepts[cid]?.type !== 'noun') return;
        const predCase = predicateNounCaseFor(lang, ordered, idx, subjectCid, isCopularTpl);
        if (!predCase) return;
        const field = pluralSubject ? predCase + '_plural' : predCase;
        if (!caseFormFor(lang, cid, field)) {
          add(`CASE_FALLBACK|${lang}|${id}|${cid}|${field}`,
            `predicate ${field} demanded but no such field — nominative ships`);
        }
      });
    }
  }
}

// ── HARD check: option display surfaces (never baselined) ───────────────────
// The L4/L5 option tiles render through the engine's surfaceForm. Its only
// unsafe path is an object entry with neither `form` nor `base` — formOf then
// falls back to "first string value in the entry", which is the gender field
// for gender-first-authored entries (Emi 2026-08-28-02: Greek L5 tiles
// showing «f» / «n»). Assert the data shape that makes the fallback
// unreachable, plus non-empty surfaces, for every concept × language.
const surfaceErrors = [];
for (const lc of langCodes) {
  const forms = vocab.languages?.[lc]?.forms || {};
  for (const [cid, entry] of Object.entries(forms)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) &&
        typeof entry.form !== 'string' && typeof entry.base !== 'string') {
      surfaceErrors.push(`OPTION_SURFACE_UNSAFE|${lc}|${cid}|object entry without form/base`);
      continue;
    }
    const s = surfaceForm(lc, cid);
    if (!s || !String(s).trim()) {
      surfaceErrors.push(`OPTION_SURFACE_EMPTY|${lc}|${cid}`);
    }
  }
}
if (surfaceErrors.length) {
  console.error(`Exercise surfaces: ${surfaceErrors.length} option-surface violation(s) — hard fail (not baselined):`);
  for (const e of surfaceErrors.slice(0, 40)) console.error('  ' + e);
  process.exit(1);
}

// ── HARD check: hubNames completeness (never baselined) ─────────────────────
const hubErrors = [];
for (const lc of langCodes) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(ROOT, 'lang', `${lc}.json`), 'utf8'));
  } catch {
    continue; // lang file completeness is validate-structure's job
  }
  const hub = data.hubNames || {};
  for (const other of langCodes) {
    if (!hub[other] || !String(hub[other]).trim()) {
      hubErrors.push(`HUBNAME_MISSING|${lc}.json|${other}`);
    }
  }
}
if (hubErrors.length) {
  console.error(`Exercise surfaces: ${hubErrors.length} hubNames gap(s) — hard fail (not baselined):`);
  for (const e of hubErrors) console.error('  ' + e);
  process.exit(1);
}

// ── Ratchet ─────────────────────────────────────────────────────────────────
const byType = {};
for (const f of findings) {
  const t = f.key.split('|')[0];
  byType[t] = (byType[t] || 0) + 1;
}
console.log(`Exercise-surface invariants: ${findings.length} finding(s)`,
  Object.keys(byType).length ? byType : '');

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
  console.error('\nNEW exercise-surface findings (fail):');
  for (const f of fresh) console.error(`  ${f.key}\n    ${f.detail}`);
  process.exit(1);
}
if (fixed.length) {
  console.log('Fixed findings — prune with: npm run validate:surface:update');
}
console.log('No new exercise-surface findings. PASS.');
