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
  trPossessiveSuffix,
  turkishPersonalCopulaSuffix,
  possessiveArticleFor,
  acceptedAnswerVariants,
  dropSubjectPronoun,
  resolveNounBlank,
  isModifierCompatible,
  nounPhrase,
  formOf,
  finalizeSentence,
  optionSurfaceFor,
  slotContextFor,
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
  // ko joined 2026-08-28: the present copula is the 이에요/예요 suffix on
  // the nominal predicate, never a standalone word (Emi run 6).
  assert.deepEqual([...langsWith("zeroPresentCopula")].sort(),
    ["ar", "ko", "tr", "uk"]);
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

// ---------------------------------------------------------------------
// Possessive placement (enclitic) — Emi 2026-08-28-01 (el); pl "it" pro-drop
// (-10); uk possessive plural agreement (-09)
// ---------------------------------------------------------------------

test("el: possessives are enclitic with the definite article", () => {
  // 16/16 observed el possessives shipped as «μου βιβλίο» — article dropped,
  // possessive pre-nominal. Both faces fixed: article + noun + enclitic.
  assert.equal(buildSentence("el", tplById("I_EAT_FOOD"), "HIS", {}),
    "Εγώ τρώω το φαγητό του.");
  assert.equal(buildSentence("el", tplById("WE_HAVE_PAN"), "HIS", {}),
    "Εμείς έχουμε το τηγάνι του.");
  // Template-slot path (authored possessive): «η παλάμη μου».
  const s = buildSentence("el", tplById("THIS_IS_MY_HAND"));
  assert.ok(s.includes("η παλάμη μου"), s);
});

test("th possessives are untouched by the enclitic generalization", () => {
  // th now declares possessiveEnclitic instead of the old hardcode —
  // output must be bit-identical (no article, spaceless).
  assert.equal(buildSentence("th", tplById("THIS_IS_MY_HAND")),
    tplById("THIS_IS_MY_HAND").render.th);
  const forced = buildSentence("th", tplById("SHE_SEES_PHONE"), "MY", {});
  assert.ok(forced.includes("โทรศัพท์ของฉัน"), forced);
});

test("pl: the inanimate 'it' subject drops before an ordinary verb", () => {
  assert.equal(buildSentence("pl", tplById("IT_DRIZZLES")), "Mży.");
  // Languages without the flag keep the pronoun.
  assert.equal(buildSentence("uk", tplById("IT_DRIZZLES")), "Воно мрячить.");
  assert.equal(buildSentence("en", tplById("IT_DRIZZLES")), "It drizzles.");
});

test("uk: copular-plural agreement reaches possessive and possessed noun", () => {
  // «Вони наша дівчата» (Emi 2026-08-28-09): both halves pluralize.
  const tpl = { template_id: "SYN_THEY_ARE_OUR_GIRLS",
    concepts: ["THIRD_PERSON_PLURAL", "BE", "OUR", "GIRL"] };
  assert.equal(buildSentence("uk", tpl), "Вони наші дівчата.");
  assert.equal(buildSentence("en", tpl), "They are our girls.");
  // Singular stays singular.
  const sg = { template_id: "SYN_SHE_IS_MY_MOM",
    concepts: ["SHE", "BE", "MY", "MOM"] };
  assert.equal(buildSentence("uk", sg), "Вона моя мама.");
});

// ---------------------------------------------------------------------
// Numeral government + gender agreement — Emi 2026-08-28-07/-08 (uk), -03/-04 (el)
// ---------------------------------------------------------------------

test("uk: numbers 5+ govern the genitive plural on noun and adjective", () => {
  // 27 of 30 sampled uk numeral sentences were wrong in run 5.
  assert.equal(buildSentence("uk", tplById("SHE_SEES_PHONE"), null, { num_PHONE: "NINE" }),
    "Вона бачить дев’ять телефонів.");
  assert.equal(buildSentence("uk", tplById("HE_SEES_SHIRT"), null,
    { num_SHIRT: "TEN", adj_SHIRT: "BAD" }),
    "Він бачить десять поганих сорочок.");
});

test("uk: 2–4 take the nominative plural and «два» agrees in gender", () => {
  assert.equal(buildSentence("uk", tplById("HE_SEES_SHIRT"), null, { num_SHIRT: "TWO" }),
    "Він бачить дві сорочки.");
});

// Ported from PR #117 (a parallel fix of the same Emi -07, superseded by the
// merged superset) — extra pins on a different template plus the membership
// and gate guards its suite added.

test("uk: numeralGenitivePlural membership is exactly pl + uk", () => {
  assert.equal(langRule("uk", "numeralGenitivePlural"), true);
  assert.deepEqual([...langsWith("numeralGenitivePlural")].sort(), ["pl", "uk"]);
});

test("uk: forced 5+ numbers govern the genitive plural on YOU_READ_BOOK", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("uk", tpl, "FIVE", {}), "Ти читаєш п’ять книг.");
  assert.equal(buildSentence("uk", tpl, "SEVEN", {}), "Ти читаєш сім книг.");
  // 2–4 keeps the nominative plural.
  assert.equal(buildSentence("uk", tpl, "FOUR", {}), "Ти читаєш чотири книги.");
});

test("uk: a 5+ number is refused when genitive_plural data is missing", () => {
  // The compat gate skips the number rather than shipping «десять погані
  // паспорт». BOOK carries the field, so simulate its absence.
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

test("uk: «один» agrees in gender and case («одну роботу»)", () => {
  assert.equal(buildSentence("uk", tplById("WE_HAVE_JOB"), null, { num_JOB: "ONE" }),
    "Ми маємо одну роботу.");
});

test("el: numerals agree in gender and the noun pluralizes", () => {
  // «δεκατέσσερα κρατήσεις» / «δεκαπέντε διαβατήριο» were Emi -03/-04.
  assert.equal(buildSentence("el", tplById("HE_HAS_RESERVATION"), null,
    { num_RESERVATION: "FOURTEEN" }),
    "Αυτός έχει δεκατέσσερις κρατήσεις.");
  assert.equal(buildSentence("el", tplById("HE_HAS_RESERVATION"), null,
    { num_RESERVATION: "ONE" }),
    "Αυτός έχει μία κράτηση.");
  // Neuter heads keep the neuter numeral.
  assert.equal(buildSentence("el", tplById("I_GET_BOOK"), null, { num_BOOK: "FOURTEEN" }),
    "Εγώ παίρνω δεκατέσσερα βιβλία.");
});

test("numbers on plural-less nouns are refused, not shipped as singular", () => {
  // The silent «δεκαπέντε διαβατήριο» / «два паспорт» class: a number ≥2 on
  // a noun with no plural data must be filtered by the compat gate.
  const before = isModifierCompatible("el", "FIFTEEN", "PASSPORT");
  assert.equal(before, true, "PASSPORT now has plural data — compatible");
  // A noun with no plural data (pokemon uk GYM) refuses the number…
  assert.equal(isModifierCompatible("uk", "TWO", "GYM"), false);
  // …while English stays algorithmic (pluralize()) and never needs the field.
  assert.equal(isModifierCompatible("en", "FOUR", "BOOK"), true);
});

// ---------------------------------------------------------------------
// Turkish possessive suffixes + copular person — Emi 2026-08-28-05 / -06
// ---------------------------------------------------------------------

test("tr: possessive suffix generator covers Emi's exact wrong/right pairs", () => {
  // Every wrong sentence from the run-5 sweep, generated correctly:
  assert.equal(trPossessiveSuffix("yiyecek", "1s"), "yiyeceğim");
  assert.equal(trPossessiveSuffix("rezervasyon", "3s"), "rezervasyonu");
  assert.equal(trPossessiveSuffix("bagaj", "1p"), "bagajımız");
  assert.equal(trPossessiveSuffix("pasaport", "3s"), "pasaportu"); // -t stays hard
  assert.equal(trPossessiveSuffix("tava", "1s"), "tavam");
  assert.equal(trPossessiveSuffix("yiyecek", "3p"), "yiyecekleri");
  // The generator reproduces the authored maps it now backs up:
  assert.equal(trPossessiveSuffix("iş", "1s"), "işim");
  assert.equal(trPossessiveSuffix("iş", "2s"), "işin");
  assert.equal(trPossessiveSuffix("iş", "1p"), "işimiz");
  assert.equal(trPossessiveSuffix("iş", "3p"), "işleri");
  assert.equal(trPossessiveSuffix("gömlek", "1s"), "gömleğim"); // k→ğ
});

test("tr: have-possession renders the suffixed noun («Benim yiyeceğim var»)", () => {
  assert.equal(buildSentence("tr", tplById("I_HAVE_FOOD")),
    "Benim yiyeceğim var.");
  assert.equal(buildSentence("tr", tplById("I_HAVE_PAN")),
    "Benim tavam var.");
  // Authored possessed maps still win (plural-possessed «kıyafetlerim» class).
  assert.equal(buildSentence("tr", tplById("WE_HAVE_JOB")),
    "Bizim bir işimiz var.");
});

test("tr: copular predicates agree in person and number", () => {
  // 11 of 13 copular sentences were «-dır» for every person (Emi -06).
  assert.equal(turkishPersonalCopulaSuffix("adam", 1, false), "adamım");
  assert.equal(turkishPersonalCopulaSuffix("kız", 2, false), "kızsın");
  assert.equal(turkishPersonalCopulaSuffix("adam", 1, true), "adamız");
  assert.equal(turkishPersonalCopulaSuffix("kız", 2, true), "kızsınız");
  assert.equal(turkishPersonalCopulaSuffix("kız", 3, true), "kızlar");
  assert.equal(turkishPersonalCopulaSuffix("kadın", 3, true), "kadınlar");
  // 3sg keeps -DIr — Emi verified «O oğlandır» correct.
  assert.equal(turkishPersonalCopulaSuffix("oğlan", 3, false), "oğlandır");
  // Vowel-final stems take the y buffer; vowel-initial suffixes soften k.
  assert.equal(turkishPersonalCopulaSuffix("anne", 1, false), "anneyim");
  assert.equal(turkishPersonalCopulaSuffix("küçük", 1, false), "küçüğüm");
  // Consonant-initial -sIn never softens.
  assert.equal(turkishPersonalCopulaSuffix("küçük", 2, false), "küçüksün");
  // Full sentences, per Emi's list:
  assert.equal(buildSentence("tr", tplById("I_AM_MAN")), "Ben adamım.");
  assert.equal(buildSentence("tr", tplById("YOU_ARE_GIRL")), "Sen kızsın.");
  assert.equal(buildSentence("tr", tplById("HE_IS_BOY")), "O oğlandır.");
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
    "possessiveSuffixes", "copulaPersonAgreement", "numeralGenderAgreement",
    "possessivePlacement", "verbGenderParadigm", "topicParticle",
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

// ---------------------------------------------------------------------
// ar: 3rd-person feminine verb agreement — Emi 2026-08-28-15
// («هي يرى» is wrong Arabic; a feminine 3sg subject requires the gendered
// verb form «هي ترى». Mechanism: verbGenderParadigm, merged from PR #121;
// PR #120's fuller data authoring rides the same paradigm.)
// ---------------------------------------------------------------------

test("ar: «هي» takes the feminine verb, every other person unchanged", () => {
  // 17 of 22 «هي» sentences carried the masculine verb in run 6.
  assert.equal(buildSentence("ar", tplById("SHE_SEES_PHONE")), "هي ترى هاتف.");
  assert.equal(buildSentence("ar", tplById("SHE_SEES_ROOM")), "هي ترى غرفة.");
  // The لدى-possession keeps its own person suffix: «هي لديها».
  assert.equal(buildSentence("ar", tplById("SHE_HAS_SHOES")), "هي لديها أحذية.");
  // Every person Emi verified correct stays correct.
  assert.equal(buildSentence("ar", tplById("I_EAT_FOOD")), "أنا آكل طعام.");
  assert.equal(buildSentence("ar", tplById("HE_READ_BOOK")), "هو يقرأ كتاب.");
  assert.equal(buildSentence("ar", tplById("YOU_READ_BOOK")), "أنت تقرأ كتاب.");
});

test("verbGenderParadigm is declared only on ar (today)", () => {
  assert.deepEqual([...langsWith("verbGenderParadigm")].sort(), ["ar"]);
});

test("ar: feminine subject picks 3_singular_feminine over 3_singular", () => {
  const forms = vocab.languages.ar.forms;
  for (const cid of ["EAT", "READ", "SEE", "DRINK", "SLEEP", "HAVE", "DO", "GO", "COME"]) {
    const entry = forms[cid];
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry),
      `ar ${cid} missing object entry`);
    assert.ok(typeof entry["3_singular_feminine"] === "string" &&
      entry["3_singular_feminine"].length > 0,
      `ar ${cid} missing 3_singular_feminine`);
    assert.notEqual(entry["3_singular_feminine"], entry["3_singular"],
      `ar ${cid} feminine equals masculine — probably wasn't authored`);
  }
  // The exact pair from Emi's report.
  assert.equal(forms.SEE["3_singular_feminine"], "ترى");
  assert.equal(forms.SEE["3_singular"], "يرى");
});

test("ar: EVERY verb in the product carries 3_singular_feminine", () => {
  // PR #121 left 12 compound pack verbs (RESPAWN, GRIND, …) as a follow-up;
  // that follow-up is closed — «هي» never falls back to the masculine now.
  for (const [cid, e] of Object.entries(vocab.languages.ar.forms)) {
    if (vocab.concepts[cid]?.type !== "verb") continue;
    if (typeof e !== "object" || Array.isArray(e)) continue;
    if (typeof e["3_singular"] !== "string") continue;
    assert.equal(typeof e["3_singular_feminine"], "string",
      `ar verb ${cid} is missing 3_singular_feminine — «هي» falls back to the masculine`);
  }
});

// ---------------------------------------------------------------------
// ko: conjugation + particles + suffixal copula — Emi 2026-08-28-12/-13
// («나 음식 먹다» was the first card of the first Korean lesson: every
// verb in dictionary form, zero particles in 140 sentences.)
// ---------------------------------------------------------------------

test("ko: polite present endings, topic and object particles", () => {
  assert.equal(buildSentence("ko", tplById("I_EAT_FOOD")), "저는 음식을 먹어요.");
  assert.equal(buildSentence("ko", tplById("I_DRINK_WATER")), "저는 물을 마셔요.");
  assert.equal(buildSentence("ko", tplById("HE_READ_BOOK")), "그는 책을 읽어요.");
  // Batchim allomorphy: 그들 ends in a consonant → 은.
  assert.equal(buildSentence("ko", tplById("THEY_SLEEP")), "그들은 자요.");
});

test("ko: have-construction is existential — 이/가 on the possessed, 있어요", () => {
  assert.equal(buildSentence("ko", tplById("I_HAVE_SHIRT")), "저는 셔츠가 있어요.");
  assert.equal(buildSentence("ko", tplById("WE_HAVE_JOB")), "우리는 일이 있어요.");
});

test("ko: the present copula is the 이에요/예요 suffix on the predicate", () => {
  // Batchim-keyed: 남자 (vowel-final) → 예요, 소년 (consonant-final) → 이에요.
  assert.equal(buildSentence("ko", tplById("I_AM_MAN")), "저는 남자예요.");
  assert.equal(buildSentence("ko", tplById("HE_IS_BOY")), "그는 소년이에요.");
  assert.equal(buildSentence("ko", tplById("THIS_IS_MY_HAND")), "이것은 제 손이에요.");
  // The dedicated builders carry the same particles + suffix.
  assert.equal(buildSentence("ko", tplById("THIS_IS_A_GOOD_BOOK")),
    "이것은 좋은 책이에요.");
  assert.equal(buildSentence("ko", tplById("IS_THAT_YOUR_PHONE")),
    "그것은 당신의 전화예요?");
});

test("ko: adjective predicates use their predicative verb form", () => {
  assert.equal(buildSentence("ko", tplById("BOOK_IS_RED")), "책은 빨개요.");
  assert.equal(buildSentence("ko", tplById("AUTUMN_IS_OLD")), "가을은 오래됐어요.");
  // Attributive position keeps the ordinary form (좋은 above), and the
  // nominal predicate — not the adjective — carries the copula suffix.
});

test("ko: authored surface overrides keep their own postposition («집에»)", () => {
  // The object particle must not double up on a case-carrying override.
  assert.equal(buildSentence("ko", tplById("I_GO_HOME")), "저는 집에 가요.");
});

test("ko: L3 blank and option tiles carry the particle with the word", () => {
  const tpl = tplById("I_EAT_FOOD");
  const sentence = buildSentence("ko", tpl);
  const blank = resolveNounBlank(sentence, tpl, "ko", "FOOD");
  assert.ok(blank, "FOOD must be blankable in «저는 음식을 먹어요»");
  assert.equal(blank.surface, "음식을");
  assert.ok(blank.blanked.includes("_____"));
  // A distractor tile in the same slot carries the same decoration.
  const slot = slotContextFor(tpl, "ko", "FOOD");
  assert.equal(slot.position, "directObject");
  assert.equal(optionSurfaceFor("ko", tpl, "BOOK", slot, { bareMode: blank.bareMode }),
    "책을");
});

test("ja: particle behaviour survives the nominalParticles generalization", () => {
  // ja declares the same rule the ko work introduced; renders must be
  // byte-identical to the old hardcoded branch.
  assert.equal(buildSentence("ja", tplById("I_EAT_FOOD")), "私は食べ物を食べる。");
});

// ---------------------------------------------------------------------
// fi: the first language built THROUGH the new pipeline (questionnaire →
// hidden registration → corpus → gate). Pins the three declared rules the
// language introduced: case-only adpositions, postposed adpositions, and
// existential possession — plus partitive numeral government.
// ---------------------------------------------------------------------

test("fi: case-only adpositions — the ending IS the preposition", () => {
  assert.equal(buildSentence("fi", tplById("BOOK_ON_TABLE")), "Kirja on pöydällä.");
  assert.equal(buildSentence("fi", tplById("BOOK_ON_THIS")), "Kirja on tällä.");
  assert.equal(buildSentence("fi", tplById("SHOES_IN_THIS")), "Kengät ovat tässä.");
  // BY rides the same rule: «kädellä», no preposition word.
  assert.equal(buildSentence("fi", tplById("I_DO_THIS_BY_HAND")), "Minä teen tämän kädellä.");
});

test("fi: postposed adpositions govern the genitive BEFORE them", () => {
  assert.equal(buildSentence("fi", tplById("PHONE_UNDER_TABLE")), "Puhelin on pöydän alla.");
  assert.equal(buildSentence("fi", tplById("BOOK_BEHIND_PHONE")), "Kirja on puhelimen takana.");
  // Coordinated landmark: both halves decline («tämän ja tuon välissä»).
  assert.equal(buildSentence("fi", tplById("BOOK_BETWEEN_THIS_AND_THAT")),
    "Kirja on tämän ja tuon välissä.");
});

test("fi: possession is existential — adessive possessor, nominative possessed", () => {
  assert.equal(buildSentence("fi", tplById("I_HAVE_SHIRT")), "Minulla on paita.");
  assert.equal(buildSentence("fi", tplById("WE_HAVE_JOB")), "Meillä on työ.");
  assert.equal(buildSentence("fi", tplById("SHE_HAS_SHOES")), "Hänellä on kengät.");
  // The blank for the possessed noun holds the nominative, never a
  // declined form.
  const tpl = tplById("I_HAVE_SHIRT");
  const blank = resolveNounBlank(buildSentence("fi", tpl), tpl, "fi", "SHIRT");
  assert.ok(blank);
  assert.equal(blank.surface, "paita");
});

test("fi: objects carry their authored object-case form", () => {
  assert.equal(buildSentence("fi", tplById("I_DRINK_WATER")), "Minä juon vettä.");
  assert.equal(buildSentence("fi", tplById("I_EAT_FOOD")), "Minä syön ruokaa.");
  assert.equal(buildSentence("fi", tplById("SHE_SEES_PHONE")), "Hän näkee puhelimen.");
});

test("fi: numbers ≥2 govern the partitive singular («kaksi kirjaa»)", () => {
  assert.equal(buildSentence("fi", tplById("YOU_READ_BOOK"), "TWO", {}),
    "Sinä luet kaksi kirjaa.");
  assert.equal(buildSentence("fi", tplById("YOU_READ_BOOK"), "FIVE", {}),
    "Sinä luet viisi kirjaa.");
  // A noun without partitive data refuses the number (wrong gets filtered).
  const entry = vocab.languages.fi.forms.BOOK;
  const saved = entry.partitive;
  delete entry.partitive;
  try {
    assert.equal(isModifierCompatible("fi", "TWO", "BOOK"), false);
  } finally {
    entry.partitive = saved;
  }
});

test("fi: copulars and predicate plural agreement", () => {
  assert.equal(buildSentence("fi", tplById("BOOK_IS_RED")), "Kirja on punainen.");
  assert.equal(buildSentence("fi", tplById("WINTER_IS_COLD")), "Talvi on kylmä.");
  // Plural-only subject: plural copula + plural adjective.
  assert.equal(buildSentence("fi", tplById("PANTS_ARE_BLACK")), "Housut ovat mustat.");
});

test("fi: hidden in the registry until the gate passes", () => {
  const fi = AVAILABLE_LANGUAGES.find((l) => l.code === "fi");
  assert.ok(fi, "fi must be registered (validators see it)");
  assert.equal(fi.hidden, true);
  assert.equal(fi.beta, true);
});
