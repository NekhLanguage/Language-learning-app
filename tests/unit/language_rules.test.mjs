// Per-language rule declarations + the render/grading behaviours they
// drive. This suite IS the "rules job" half of adding a language: the
// completeness test fails until the new language has a declared row, and
// each behaviour test pins the rule on a concrete language so a
// regression names the exact rule that broke.
//
// Born from Emi run 3 (2026-08-26): Italian shipped with possessives
// missing their article, doubled articles in fill-in-the-blank, and
// numbers counting mass nouns — all defect classes previously fixed for
// other languages as language-specific branches that Italian never
// inherited.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGE_RULES, langRule, langsWith } from "../../language_rules.mjs";
import { AVAILABLE_LANGUAGES } from "../../languages.js";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import {
  configureEngine,
  buildSentence,
  buildSentenceWithRules,
  possessiveArticleFor,
  acceptedAnswerVariants,
  dropSubjectPronoun,
  resolveNounBlank,
  isModifierCompatible,
  nounPhrase,
  formOf,
} from "../../sentence_engine.mjs";

let vocab, templates;
const tplById = (id) => templates.find((t) => t.template_id === id);

before(() => {
  vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999, // suppress random modifier injection
  });
});

// ---------------------------------------------------------------------
// The contract: every shipped language declares a rules row.
// ---------------------------------------------------------------------

test("every shipped language has a LANGUAGE_RULES row", () => {
  for (const { code } of AVAILABLE_LANGUAGES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(LANGUAGE_RULES, code),
      `language "${code}" ships without a LANGUAGE_RULES declaration — ` +
        "adding a language is a content job PLUS a rules job",
    );
  }
});

test("no LANGUAGE_RULES row for a language the app does not ship", () => {
  const shipped = new Set(AVAILABLE_LANGUAGES.map((l) => l.code));
  for (const code of Object.keys(LANGUAGE_RULES)) {
    assert.ok(shipped.has(code), `LANGUAGE_RULES has stale row "${code}"`);
  }
});

test("derived sets keep their pre-consolidation memberships", () => {
  assert.deepEqual([...langsWith("indefiniteArticle")].sort(),
    ["de", "el", "en", "es", "fr", "it", "no", "pt"]);
  assert.deepEqual([...langsWith("postNominalAdjectives")].sort(),
    ["ar", "it", "pt", "th"]);
  assert.deepEqual([...langsWith("zeroPresentCopula")].sort(),
    ["ar", "tr", "uk"]);
  assert.deepEqual([...langsWith("spacelessJoin")].sort(), ["th"]);
  assert.deepEqual([...langsWith("spacelessTiles")].sort(), ["ja", "th", "zh"]);
});

// ---------------------------------------------------------------------
// possessiveDefiniteArticle — Emi 2026-08-26-03
// ---------------------------------------------------------------------

test("it: forced (drilled) possessive carries the definite article", () => {
  // The forced-modifier splice is the path that shipped «suo taxi».
  assert.equal(buildSentence("it", tplById("I_EAT_FOOD"), "HIS", {}),
    "Io mangio il suo cibo.");
  assert.equal(buildSentence("it", tplById("SHE_SEES_PHONE"), "HIS", {}),
    "Lei vede il suo telefono.");
  // Feminine possessed noun agrees: «la sua acqua».
  assert.equal(buildSentence("it", tplById("I_DRINK_WATER"), "HER", {}),
    "Io bevo la sua acqua.");
});

test("it: template-slot possessives keep the article (unchanged path)", () => {
  assert.equal(buildSentence("it", tplById("THIS_IS_MY_HAND")),
    tplById("THIS_IS_MY_HAND").render.it);
});

test("it: forced possessive on other languages is untouched", () => {
  assert.equal(buildSentence("en", tplById("I_EAT_FOOD"), "HIS", {}),
    "I eat his food.");
  // pt declares no possessiveDefiniteArticle rule — whatever the possessive
  // renders as, no article is prefixed («dele telefone», not «o dele…»).
  const pt = buildSentence("pt", tplById("SHE_SEES_PHONE"), "HIS", {});
  assert.ok(!/\bo dele|\ba dele/.test(pt), pt);
  assert.ok(pt.startsWith("Ela vê "), pt);
});

test("possessiveArticleFor honours noArticleWithPossessive and plurals", () => {
  assert.equal(possessiveArticleFor("it", "PHONE"), "il");
  assert.equal(possessiveArticleFor("it", "WATER"), "la");
  assert.equal(possessiveArticleFor("it", "SHOES"), "le"); // pluralOnly
  assert.equal(possessiveArticleFor("en", "PHONE"), null);
  // Singular family nouns are flagged noArticleWithPossessive in it.json.
  const family = Object.entries(vocab.languages.it.forms)
    .filter(([, e]) => e && e.noArticleWithPossessive)
    .map(([cid]) => cid);
  assert.ok(family.length > 0, "it.json declares family-noun exceptions");
  for (const cid of family) {
    assert.equal(possessiveArticleFor("it", cid), null);
  }
});

// ---------------------------------------------------------------------
// L3 blank contract — Emi 2026-08-26-02
// ---------------------------------------------------------------------

test("it: L3 blank takes the article with the noun (frame has no article)", () => {
  const tpl = tplById("SHE_SEES_PHONE");
  const sentence = buildSentence("it", tpl);
  assert.equal(sentence, "Lei vede un telefono.");
  const blank = resolveNounBlank(sentence, tpl, "it", "PHONE");
  assert.ok(blank, "blank resolves");
  assert.equal(blank.blanked, "Lei vede _____.");
  assert.equal(blank.surface, "un telefono");
  assert.equal(blank.bareMode, false);
  // The articled option tile completes the frame without doubling:
  assert.equal(nounPhrase("it", "PHONE"), "un telefono");
});

test("it: bare-context blanks fall back to the bare noun in bare mode", () => {
  const tpl = tplById("I_EAT_FOOD");
  // Forced possessive makes the noun render bare after «il suo».
  const sc = {};
  const sentence = buildSentence("it", tpl, "HIS", sc);
  assert.equal(sentence, "Io mangio il suo cibo.");
  const blank = resolveNounBlank(sentence, tpl, "it", "FOOD");
  assert.ok(blank, "blank resolves");
  assert.equal(blank.blanked, "Io mangio il suo _____.");
  assert.equal(blank.bareMode, true);
});

test("en: L3 blank behaves the same (article rides the option)", () => {
  const tpl = tplById("SHE_SEES_PHONE");
  const sentence = buildSentence("en", tpl);
  const blank = resolveNounBlank(sentence, tpl, "en", "PHONE");
  assert.equal(blank.blanked, "She sees _____.");
  assert.equal(blank.surface, "a phone");
});

// ---------------------------------------------------------------------
// Mass-noun filter on forced modifiers — Emi 2026-08-26-04
// ---------------------------------------------------------------------

test("forced number never counts a mass noun, in any language", () => {
  const tpl = tplById("I_DRINK_WATER");
  assert.equal(buildSentence("it", tpl, "FOUR", {}), "Io bevo acqua.");
  assert.equal(buildSentence("en", tpl, "EIGHT", {}), "I drink water.");
  const { hadModifier } = buildSentenceWithRules("it", tpl, "FOUR", {});
  assert.equal(hadModifier, false, "dropped number is not reported as landed");
});

test("forced number still lands on countable nouns", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("it", tpl, "FOUR", {}), "Tu leggi quattro libri.");
  assert.equal(buildSentence("en", tpl, "FOUR", {}), "You read four books.");
});

// ---------------------------------------------------------------------
// Animacy filter — Dan ruling 5, 2026-08-27 (the 古い女の子 class)
// ---------------------------------------------------------------------

test("OLD/NEW never modify people; still modify objects", () => {
  for (const lang of ["en", "it", "ja"]) {
    assert.equal(isModifierCompatible(lang, "OLD", "GIRL"), false);
    assert.equal(isModifierCompatible(lang, "NEW", "MAN"), false);
    assert.equal(isModifierCompatible(lang, "OLD", "BOOK"), true);
  }
});

// ---------------------------------------------------------------------
// Grader variants — Emi 2026-08-26-01 + Dan rulings 1 & 3
// ---------------------------------------------------------------------

test("it: grader accepts pronoun-dropped and pre-nominal-adjective forms", () => {
  const tpl = tplById("YOU_READ_BOOK");
  const sc = { adj_BOOK: "SMALL", num_BOOK: null };
  const target = buildSentence("it", tpl, null, sc);
  assert.equal(target, "Tu leggi un libro piccolo.");
  const variants = acceptedAnswerVariants("it", tpl, target, sc);
  assert.ok(variants.includes("Tu leggi un libro piccolo."), "taught form");
  assert.ok(variants.includes("Tu leggi un piccolo libro."), "pre-nominal order");
  assert.ok(variants.includes("Leggi un libro piccolo."), "pronoun-dropped");
  assert.ok(variants.includes("Leggi un piccolo libro."), "both");
});

test("es/pt: pronoun-dropped form accepted; en unchanged", () => {
  const tpl = tplById("YOU_READ_BOOK");
  const es = buildSentence("es", tpl);
  assert.equal(dropSubjectPronoun("es", tpl, es), "Lees un libro.");
  const en = buildSentence("en", tpl);
  assert.equal(dropSubjectPronoun("en", tpl, en), "Read a book.");
  assert.equal(acceptedAnswerVariants("en", tpl, en, {}).length, 1,
    "en declares neither proDrop nor flexibleAdjectiveOrder");
});

test("it: pre-nominal variant recomputes the article against the adjective", () => {
  // «un'attrazione vecchia» must NOT become «un'vecchia attrazione».
  const tpl = tplById("SHE_SEES_PHONE");
  const sc = { adj_PHONE: "OLD", num_PHONE: null };
  const target = buildSentence("it", tpl, null, sc);
  assert.equal(target, "Lei vede un telefono vecchio.");
  const variants = acceptedAnswerVariants("it", tpl, target, sc);
  assert.ok(variants.includes("Lei vede un vecchio telefono."));
});

// ---------------------------------------------------------------------
// Dan ruling 4 — landmark is «monumento», not «attrazione»
// ---------------------------------------------------------------------

test("it: LANDMARK renders monumento", () => {
  assert.equal(formOf("it", "LANDMARK"), "monumento");
  assert.equal(nounPhrase("it", "LANDMARK"), "un monumento");
});

// ---------------------------------------------------------------------
// langRule plumbing
// ---------------------------------------------------------------------

test("langRule answers declared flags and nothing else", () => {
  assert.equal(langRule("it", "proDrop"), true);
  assert.equal(langRule("en", "proDrop"), false);
  assert.equal(langRule("xx", "proDrop"), false);
  assert.equal(langRule("it", "notARule"), false);
});
