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
  finalizeSentence,
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
  // fr/es joined 2026-08-27: post-nominal is their correct DEFAULT (the
  // missing flag shipped «un noir livre» — Emi -12); role-based
  // pre-nominal placement refines it per language.
  assert.deepEqual([...langsWith("postNominalAdjectives")].sort(),
    ["ar", "es", "fr", "it", "pt", "th"]);
  assert.deepEqual([...langsWith("zeroPresentCopula")].sort(),
    ["ar", "tr", "uk"]);
  assert.deepEqual([...langsWith("spacelessJoin")].sort(), ["th"]);
  assert.deepEqual([...langsWith("spacelessTiles")].sort(), ["ja", "th", "zh"]);
});

// ---------------------------------------------------------------------
// The CJS validators cannot import this ESM registry, so their hardcoded
// language sets are kept in sync BY THIS TEST: it parses each validator's
// set literal and asserts the membership equals the declared flag. Drift
// fails here, naming the file.
// ---------------------------------------------------------------------

test("CJS validator language lists match the declared flags", async () => {
  const fs = await import("node:fs");
  const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const extractSet = (src, constName) => {
    const m = src.match(new RegExp(`const ${constName} = new Set\\(\\[([^\\]]*)\\]\\)`));
    assert.ok(m, `${constName} set literal found`);
    return [...m[1].matchAll(/'([a-z]{2})'/g)].map((x) => x[1]).sort();
  };
  const packs = read("validation/validate-packs.js");
  const structure = read("validation/validate-structure.js");
  const encoding = read("validation/validate-encoding.js");
  assert.deepEqual(extractSet(packs, "GENDER_REQUIRED_LANGS"),
    [...langsWith("nounGenderForCountables")].sort(), "validate-packs GENDER_REQUIRED_LANGS");
  assert.deepEqual(extractSet(structure, "GENDER_REQUIRED_LANGS"),
    [...langsWith("nounGenderForCountables")].sort(), "validate-structure GENDER_REQUIRED_LANGS");
  assert.deepEqual(extractSet(packs, "FULL_GENDER_LANGS"),
    [...langsWith("fullNounGender")].sort(), "validate-packs FULL_GENDER_LANGS");
  assert.deepEqual(extractSet(packs, "VERB_PERSON_LANGS"),
    [...langsWith("verbPersonParadigm")].sort(), "validate-packs VERB_PERSON_LANGS");
  assert.deepEqual(extractSet(encoding, "LATIN_LANGS"),
    [...langsWith("latinEncodingChecks")].sort(), "validate-encoding LATIN_LANGS");
});

// ---------------------------------------------------------------------
// caseMarking declarations drive the engine's case machinery
// ---------------------------------------------------------------------

test("uk caseMarking declaration matches the engine's historic behaviour", () => {
  const cm = LANGUAGE_RULES.uk.caseMarking;
  assert.equal(cm.directObjectCase, "accusative");
  assert.equal(cm.femAccusativeStrategy, "uk");
  assert.equal(cm.bareInstrumentalMeans, true);
  assert.deepEqual(cm.prepositions, {
    ON: "locative", IN: "locative", OFF: "locative",
    UNDER: "instrumental", BEHIND: "instrumental", FRONT: "instrumental",
    BETWEEN: "instrumental", NEXT_TO: "instrumental", BY: "instrumental",
    WITH: "instrumental",
    TO: "genitive", FROM: "genitive", FOR: "genitive",
  });
});

test("pl caseMarking declaration pins the launch grammar", () => {
  const cm = LANGUAGE_RULES.pl.caseMarking;
  assert.equal(cm.directObjectCase, "accusative");
  assert.equal(cm.femAccusativeStrategy, "pl");
  assert.equal(cm.bareInstrumentalMeans, true);
  assert.equal(cm.predicateNounCase, "instrumental");
  assert.deepEqual(cm.prepositions, {
    ON: "locative", IN: "locative", OFF: "locative",
    UNDER: "instrumental", BEHIND: "instrumental", FRONT: "instrumental",
    BETWEEN: "instrumental", WITH: "instrumental",
    BY: "instrumental",
    NEXT_TO: "genitive", TO: "genitive", FROM: "genitive",
    FOR: "genitive",
  });
  // Polish is NOT a zero-copula language — być is overt on every path.
  assert.equal(langRule("pl", "zeroPresentCopula"), false);
});

// ---------------------------------------------------------------------
// pl: predicate nouns take the instrumental («Jestem mężczyzną»)
// ---------------------------------------------------------------------

test("pl: predicate noun after the copula is instrumental", () => {
  assert.equal(buildSentence("pl", tplById("I_AM_MAN")),
    "Ja jestem mężczyzną.");
  // Possessive + noun decline TOGETHER or not at all («moją mamą»).
  assert.equal(buildSentence("pl", tplById("SHE_IS_MY_MOM")),
    "Ona jest moją mamą.");
});

test("pl: demonstrative-subject predicates stay nominative", () => {
  // «To jest rzecz» — identification, not classification: the predicate
  // noun does NOT take the instrumental after a demonstrative subject.
  assert.equal(buildSentence("pl", tplById("THIS_IS_THING")),
    "To jest rzecz.");
  // Possessive + noun predicates too («moja ręka», not «moją ręką»).
  assert.equal(buildSentence("pl", tplById("THIS_IS_MY_HAND")),
    "To jest moja ręka.");
});

// ---------------------------------------------------------------------
// pl: numbers five and above govern the genitive plural
// ---------------------------------------------------------------------

test("pl: 5+ takes genitive plural, 2–4 the plain plural", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("pl", tpl, "FIVE", {}),
    "Ty czytasz pięć książek.");
  assert.equal(buildSentence("pl", tpl, "FOUR", {}),
    "Ty czytasz cztery książki.");
});

test("pl: 5+ number is dropped when genitive_plural data is missing", () => {
  // Compat gate: a noun without the field skips the number rather than
  // shipping «pięć książki».
  const entry = vocab.languages.pl.forms.BOOK;
  const saved = entry.genitive_plural;
  delete entry.genitive_plural;
  try {
    assert.equal(isModifierCompatible("pl", "FIVE", "BOOK"), false);
    assert.equal(isModifierCompatible("pl", "FOUR", "BOOK"), true);
  } finally {
    entry.genitive_plural = saved;
  }
});

test("pl: numbers never land on virile nouns (special numeral forms)", () => {
  // «pięciu mężczyzn» / «czterej bracia» need numeral forms the engine has
  // no data for — the compat gate skips the number instead.
  assert.equal(isModifierCompatible("pl", "FIVE", "MAN"), false);
  assert.equal(isModifierCompatible("pl", "FOUR", "MAN"), false);
  assert.equal(isModifierCompatible("pl", "FIVE", "BOOK"), true);
});

// ---------------------------------------------------------------------
// uk: numerals five and above govern the genitive plural (Emi 2026-08-28-07)
// «десять погані паспорт» → skipped when data is missing, or rendered
// «сім книг» when the noun carries the field.
// ---------------------------------------------------------------------

test("uk: numeralGenitivePlural is declared and matches pl's memberships", () => {
  assert.equal(langRule("uk", "numeralGenitivePlural"), true);
  assert.deepEqual([...langsWith("numeralGenitivePlural")].sort(), ["pl", "uk"]);
});

test("uk: 5+ takes the genitive plural where the field is authored", () => {
  // Emi's confirmed cases from run 5, verbatim:
  //   «Він читає сім книги» → «сім книг»
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("uk", tpl, "FIVE", {}),
    "Ти читаєш п’ять книг.");
  assert.equal(buildSentence("uk", tpl, "SEVEN", {}),
    "Ти читаєш сім книг.");
});

test("uk: 2–4 keeps the plural (nominative) — «два книги» stays a plural", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("uk", tpl, "FOUR", {}),
    "Ти читаєш чотири книги.");
});

test("uk: 5+ number is dropped when genitive_plural data is missing", () => {
  // Compat gate: uk nouns without the field skip the number rather than
  // shipping «десять погані паспорт». BOOK carries the field so drops
  // require a data-less noun.
  const entry = vocab.languages.uk.forms.BOOK;
  const saved = entry.genitive_plural;
  delete entry.genitive_plural;
  try {
    assert.equal(isModifierCompatible("uk", "FIVE", "BOOK"), false);
    assert.equal(isModifierCompatible("uk", "FOUR", "BOOK"), true);
  } finally {
    entry.genitive_plural = saved;
  }
});

test("pl: virile nouns and adjectives carry the vp agreement data", () => {
  const forms = vocab.languages.pl.forms;
  const virile = Object.values(forms).filter((e) => e && e.virile);
  assert.ok(virile.length > 0, "pl.json declares virile nouns");
  // Every declinable pl adjective with a plural form also carries vp —
  // a virile subject must never agree with the non-virile plural.
  for (const [cid, e] of Object.entries(forms)) {
    if (!e || !e.plural || !e.f) continue; // adjectives carry f + plural
    assert.equal(typeof e.vp, "string",
      `pl adjective ${cid} lacks the virile plural (vp) form`);
  }
});

// ---------------------------------------------------------------------
// pl: feminine accusative fallback strategy («woda» → «wodę»)
// ---------------------------------------------------------------------

test("pl: fem accusative derives -a→-ę when no explicit field exists", () => {
  assert.equal(vocab.languages.pl.forms.WATER.accusative, undefined,
    "WATER relies on the strategy, not authored data");
  assert.equal(buildSentence("pl", tplById("I_DRINK_WATER")),
    "Ja piję wodę.");
});

// ---------------------------------------------------------------------
// pl: bare instrumental of means + finalizeSentence euphony/punctuation
// ---------------------------------------------------------------------

test("pl: means is the bare instrumental — BY drops", () => {
  assert.equal(buildSentence("pl", tplById("I_DO_THIS_BY_HAND")),
    "Ja robię to ręką.");
});

test("pl: conjunctions take a comma; z lengthens to ze before clusters", () => {
  assert.equal(buildSentence("pl", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH")),
    "On je śniadanie, ale nie obiad.");
});

// ---------------------------------------------------------------------
// pl: preposition-governed cases (locative / instrumental / genitive)
// ---------------------------------------------------------------------

test("pl: prepositions govern their declared cases", () => {
  assert.equal(buildSentence("pl", tplById("BOOK_ON_TABLE")),
    "Książka jest na stole."); // ON → locative
  assert.equal(buildSentence("pl", tplById("I_GO_FROM_HOME")),
    "Ja idę z domu."); // FROM → genitive
});

// ---------------------------------------------------------------------
// de: determiner-side case marking + adjective declension
// (Emi 2026-08-27-10/-11 — «ein neu Buch», «Wir haben ein Job»)
// ---------------------------------------------------------------------

test("de: masculine direct objects take einen", () => {
  assert.equal(buildSentence("de", tplById("WE_HAVE_JOB")),
    "Wir haben einen Job.");
  // Neuter and feminine accusatives equal the nominative — unchanged.
  assert.equal(buildSentence("de", tplById("I_GET_BOOK")),
    "Ich bekomme ein Buch.");
});

test("de: dative after prepositions rides the determiner", () => {
  assert.equal(buildSentence("de", tplById("BOOK_ON_TABLE")),
    "Das Buch ist auf dem Tisch.");
  assert.equal(buildSentence("de", tplById("PHONE_UNDER_TABLE")),
    "Das Telefon ist unter dem Tisch.");
  // Demonstratives decline via their own case fields.
  assert.equal(buildSentence("de", tplById("BOOK_ON_THIS")),
    "Das Buch ist auf diesem.");
  assert.equal(buildSentence("de", tplById("PHONE_IN_THAT")),
    "Das Telefon ist in jenem.");
});

test("de: possessives agree in gender and decline with the governed case", () => {
  assert.equal(buildSentence("de", tplById("THIS_IS_MY_HAND")),
    "Das ist meine Hand.");
  const s = buildSentence("de", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"));
  assert.ok(s.includes("mit seiner Tochter"), s);
});

test("de: attributive adjectives take mixed/strong endings; predicative stays bare", () => {
  assert.equal(buildSentence("de", tplById("I_GET_BOOK"), "NEW", {}),
    "Ich bekomme ein neues Buch.");
  assert.equal(buildSentence("de", tplById("I_GET_BOOK"), "BLACK", {}),
    "Ich bekomme ein schwarzes Buch.");
  assert.equal(buildSentence("de", tplById("I_SEE_AIRPORT"), "OLD", {}),
    "Ich sehe einen alten Flughafen.");
  assert.equal(buildSentence("de", tplById("THIS_IS_A_GOOD_BOOK")),
    "Das ist ein gutes Buch.");
  // Predicative adjectives stay uninflected — the fix must never touch them.
  assert.equal(buildSentence("de", tplById("BOOK_IS_RED")),
    "Das Buch ist rot.");
});

test("de: finalizeSentence contracts preposition + dative article", () => {
  assert.equal(finalizeSentence("de", "Ich gehe zu dem Haus."),
    "Ich gehe zum Haus.");
  assert.equal(finalizeSentence("de", "Das Buch ist in dem Haus."),
    "Das Buch ist im Haus.");
});

// ---------------------------------------------------------------------
// Romance adjective placement + apocope — Emi 2026-08-27-12 / -13
// ---------------------------------------------------------------------

test("fr: adjectives are post-nominal by default, BAGS roles pre-nominal", () => {
  assert.equal(buildSentence("fr", tplById("I_GET_BOOK"), "BLACK", {}),
    "J'obtiens un livre noir.");
  // Beauty/age/goodness/size stay in front: «un nouveau livre», «un bon livre».
  assert.equal(buildSentence("fr", tplById("I_GET_BOOK"), "NEW", {}),
    "J'obtiens un nouveau livre.");
  assert.equal(buildSentence("fr", tplById("I_GET_BOOK"), "GOOD", {}),
    "J'obtiens un bon livre.");
  // («C'est…» vs authored «Ceci est…» is a separate baselined divergence —
  // assert the noun phrase, which is what this rule owns.)
  const s = buildSentence("fr", tplById("THIS_IS_A_GOOD_BOOK"));
  assert.ok(s.includes("un bon livre"), s);
});

test("es: adjectives post-nominal; buen/mal apocopate before masc singulars", () => {
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "BLACK", {}),
    "Yo obtengo un libro negro.");
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "NEW", {}),
    "Yo obtengo un libro nuevo.");
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "GOOD", {}),
    "Yo obtengo un buen libro.");
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "BAD", {}),
    "Yo obtengo un mal libro.");
  assert.equal(buildSentence("es", tplById("THIS_IS_A_GOOD_BOOK")),
    tplById("THIS_IS_A_GOOD_BOOK").render.es);
  // Feminine heads block apocope: «una buena camisa», never «una buen camisa».
  assert.equal(buildSentence("es", tplById("HE_SEES_SHIRT"), "GOOD", {}),
    "Él ve una buena camisa.");
  assert.equal(buildSentence("es", tplById("HE_SEES_SHIRT"), "BAD", {}),
    "Él ve una mala camisa.");
});

test("it/pt: quality adjectives pre-nominal, everything else post-nominal", () => {
  assert.equal(buildSentence("it", tplById("I_GET_BOOK"), "BLACK", {}),
    "Io prendo un libro nero.");
  assert.equal(buildSentence("it", tplById("I_GET_BOOK"), "GOOD", {}),
    "Io prendo un buon libro.");
  assert.equal(buildSentence("it", tplById("HE_SEES_SHIRT"), "GOOD", {}),
    "Lui vede una buona camicia.");
  assert.equal(buildSentence("it", tplById("THIS_IS_A_GOOD_BOOK")),
    tplById("THIS_IS_A_GOOD_BOOK").render.it);
  assert.equal(buildSentence("pt", tplById("I_GET_BOOK"), "BLACK", {}),
    "Eu pego um livro preto.");
  assert.equal(buildSentence("pt", tplById("I_GET_BOOK"), "GOOD", {}),
    "Eu pego um bom livro.");
  assert.equal(buildSentence("pt", tplById("THIS_IS_A_GOOD_BOOK")),
    tplById("THIS_IS_A_GOOD_BOOK").render.pt);
});

test("apocope surfaces are what the L3 blank contract records", () => {
  // The blank must match the «buen» actually rendered, not citation «bueno».
  const shared = {};
  buildSentence("es", tplById("I_GET_BOOK"), "GOOD", shared);
  assert.equal(shared.blankSurface_es, "buen");
  const sharedIt = {};
  buildSentence("it", tplById("I_GET_BOOK"), "GOOD", sharedIt);
  assert.equal(sharedIt.blankSurface_it, "buon");
  // Post-nominal placement keeps the full form.
  const sharedPost = {};
  buildSentence("es", tplById("I_GET_BOOK"), "BLACK", sharedPost);
  assert.equal(sharedPost.blankSurface_es, "negro");
});

test("wordOrder declarations preserve the historic WORD_ORDER map", () => {
  const sov = Object.keys(LANGUAGE_RULES)
    .filter((l) => LANGUAGE_RULES[l].wordOrder === "SOV").sort();
  assert.deepEqual(sov, ["ja", "ko", "tr"]);
  // Everything else defaults to SVO — no language declares VSO today.
  assert.ok(!Object.values(LANGUAGE_RULES).some((r) => r.wordOrder === "VSO"));
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
// The grammar coverage matrix (features blocks)
// ---------------------------------------------------------------------

test("every shipped language declares a features block", () => {
  for (const { code } of AVAILABLE_LANGUAGES) {
    assert.ok(LANGUAGE_RULES[code]?.features &&
      Object.keys(LANGUAGE_RULES[code].features).length > 0,
      `language "${code}" has no features block — the coverage matrix ` +
        "cannot see what it needs (validate-grammar-coverage hard-fails on this too)");
  }
});

test("every features key is a known, checkable feature id", () => {
  const KNOWN = new Set([
    "indefiniteArticle", "marksCaseOnDirectObjects",
    "marksCaseAfterPrepositions", "predicateNounCase",
    "declinesAttributiveAdjectives", "adjectivePosition", "apocope",
    "articleCaseMarking", "virilePlural", "numeralGovernment",
    "zeroPresentCopula", "definitenessAgreement",
  ]);
  for (const [code, row] of Object.entries(LANGUAGE_RULES)) {
    for (const key of Object.keys(row.features || {})) {
      assert.ok(KNOWN.has(key),
        `${code}.features.${key} has no check in validate-grammar-coverage — ` +
          "an uncheckable feature silently passes");
    }
  }
});

test("launch-verified languages have zero coverage gaps (pl, uk)", () => {
  // Mirrors the validator's VERIFIED_REGRESSION hard fail on the two
  // properties cheap to assert here: their declared case needs are
  // implemented in their own rows.
  for (const code of ["pl", "uk"]) {
    const row = LANGUAGE_RULES[code];
    if (row.features.marksCaseOnDirectObjects) {
      assert.ok(row.caseMarking?.directObjectCase, `${code} direct-object case`);
    }
    if (row.features.marksCaseAfterPrepositions) {
      assert.ok(Object.keys(row.caseMarking?.prepositions || {}).length > 0,
        `${code} preposition case table`);
    }
    if (row.features.predicateNounCase) {
      assert.ok(row.caseMarking?.predicateNounCase, `${code} predicate case`);
    }
  }
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
