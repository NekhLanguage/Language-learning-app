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
  jaQuantifierPrefix,
  safeSurfaceForConcept,
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
  // tr joined 2026-08-30: `bir` is invariant and always separated from the
  // noun, but it still IS an indefinite article — Emi cycle-15 was 51/128
  // tr divergences on this missing mechanism.
  assert.deepEqual([...langsWith("indefiniteArticle")].sort(),
    ["de", "el", "en", "es", "fr", "it", "no", "pt", "tr"]);
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

// ---------------------------------------------------------------------
// zh/ja run-13 lexicon rows — Emi 2026-09-02-62 / -63 / ja leftovers
// ---------------------------------------------------------------------

test("zh: attributive adjectives of two+ characters take 的, monosyllabic stay bare (-62)", () => {
  assert.equal(buildSentence("zh", tplById("I_GET_BOOK"), "EASY", {}),
    "我得到一本容易的书。");
  assert.equal(buildSentence("zh", tplById("I_HAVE_SHIRT"), "EASY", {}),
    "我有一件容易的衬衫。");
  assert.equal(buildSentence("zh", tplById("I_GET_BOOK"), "GOOD", {}),
    "我得到一本好书。");
  // Predicate position is untouched.
  assert.equal(buildSentence("zh", tplById("BOOK_IS_EASY"), null, {}),
    "书很容易。");
});

test("CORRECT/WRONG never modify a body part; directional RIGHT still does (-63)", () => {
  assert.equal(isModifierCompatible("zh", "CORRECT", "EYE"), false);
  assert.equal(isModifierCompatible("en", "WRONG", "FOOT"), false);
  assert.equal(isModifierCompatible("zh", "RIGHT", "EYE"), true);
});

test("ja: な-adjectives keep な attributively and drop it before です; a counter equal to its noun falls back to つ", () => {
  assert.equal(buildSentence("ja", tplById("I_GET_BOOK"), "EASY", {}),
    "私は簡単な本を手に入れます。");
  assert.equal(buildSentence("ja", tplById("BOOK_IS_EASY"), null, {}),
    "本は簡単です。");
  assert.equal(buildSentence("ja", tplById("SHE_SEES_ROOM"), "FIVE", {}),
    "彼女は五つの部屋を見ます。");
  assert.equal(buildSentence("ja", tplById("I_GET_BOOK"), "FIVE", {}),
    "私は五冊の本を手に入れます。");
});

// ---------------------------------------------------------------------
// French first sweep — Emi 2026-09-02-64 … -69
// ---------------------------------------------------------------------

test("fr: possessive determiners agree with the possessed noun (-64)", () => {
  // ma/ta/sa before a feminine noun; the masculine form before a vowel.
  assert.equal(buildSentence("fr", tplById("THIS_IS_MY_HAND"), null, {}),
    "C'est ma main.");
  assert.equal(buildSentence("fr", tplById("THAT_IS_YOUR_LEG"), null, {}),
    "Cela est ta jambe.");
  assert.equal(buildSentence("fr", tplById("SHE_IS_MY_MOM"), null, {}),
    "Elle est ma maman.");
  // The determiner looks past an injected adjective to the noun.
  assert.equal(buildSentence("fr", tplById("SHE_IS_MY_MOM"), "BIG", {}),
    "Elle est ma grande maman.");
  // Drilled possessive on a pluralOnly noun takes the plural cell.
  assert.equal(buildSentence("fr", tplById("I_INSURE_LUGGAGE"), null, {}),
    "J'assure mes bagages.");
  // Vowel-initial feminine keeps the masculine form («mon eau», not «ma eau»).
  assert.equal(formOf("fr", "WATER"), "eau");
  assert.equal(nounPhrase("fr", "WATER"), "de l'eau");
});

test("fr: mass and plural objects take the partitive article (-65)", () => {
  assert.equal(buildSentence("fr", tplById("I_DRINK_WATER"), null, {}),
    "Je bois de l'eau.");
  assert.equal(buildSentence("fr", tplById("WE_HAVE_LUGGAGE"), null, {}),
    "Nous avons des bagages.");
  assert.equal(buildSentence("fr", tplById("SHE_HAS_SHOES"), null, {}),
    "Elle a des chaussures.");
  // «des» reduces to «de» before a pre-nominal adjective; a post-nominal
  // adjective keeps «des» and agrees in the feminine plural.
  assert.equal(buildSentence("fr", tplById("WE_HAVE_CLOTHES"), "BAD", {}),
    "Nous avons de mauvais vêtements.");
  assert.equal(buildSentence("fr", tplById("SHE_HAS_SHOES"), "BLACK", {}),
    "Elle a des chaussures noires.");
  // A pluralOnly subject is plural throughout («Les chaussures sont …»).
  assert.ok(buildSentence("fr", tplById("SHOES_UNDER_THIS"), null, {})
    .startsWith("Les chaussures sont "));
});

test("fr: yes/no question fronts «Est-ce que» with French spacing (-66)", () => {
  assert.equal(buildSentence("fr", tplById("IS_THAT_YOUR_PHONE"), null, {}),
    "Est-ce que cela est ton téléphone ?");
});

test("fr: elision never fires inside a word (-67)", () => {
  assert.equal(finalizeSentence("fr", "Je achète un souvenir."),
    "J'achète un souvenir.");
  assert.equal(finalizeSentence("fr", "Il ne aime pas le hôtel."),
    "Il n'aime pas l'hôtel.");
  assert.equal(buildSentence("fr", tplById("I_PURCHASE_SOUVENIR"), null, {}),
    "J'achète un souvenir.");
});

test("fr: nouvel/vieil before a vowel-initial masculine singular (-68)", () => {
  assert.equal(buildSentence("fr", tplById("SHE_HAS_ITINERARY"), "NEW", {}),
    "Elle a un nouvel itinéraire.");
  assert.equal(buildSentence("fr", tplById("I_SEE_SINK"), "OLD", {}),
    "Je vois un vieil évier.");
  // Consonant-initial and plural keep the ordinary forms.
  assert.equal(buildSentence("fr", tplById("I_GET_BOOK"), "NEW", {}),
    "J'obtiens un nouveau livre.");
});

test("fr: professions and HOME are bare predicates after être (-69)", () => {
  assert.equal(buildSentence("fr", tplById("HE_IS_WAITER"), null, {}),
    "Il est serveur.");
  assert.equal(buildSentence("fr", tplById("SHE_IS_GUIDE"), null, {}),
    "Elle est guide.");
  // A modifier restores the article with it.
  assert.equal(buildSentence("fr", tplById("HE_IS_WAITER"), "GOOD", {}),
    "Il est un bon serveur.");
  assert.equal(buildSentence("fr",
    tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"), null, {}),
    "S'il est à la maison, il mange avec sa fille.");
  assert.equal(buildSentence("fr", tplById("I_GO_HOME"), null, {}),
    "Je vais à la maison.");
});

// ---------------------------------------------------------------------
// Emi runs 14/15 small batch — fr -70, es -75 / (d) / (e) / personal a,
// el (c) / (f) / μια, ja -73, zh -62 residual, by-hand surfaces
// ---------------------------------------------------------------------

test("but-not: objectNegator languages negate the bare object (fr -70, el)", () => {
  assert.equal(buildSentence("fr", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH"), null, {}),
    "Il mange un petit-déjeuner mais pas de déjeuner.");
  assert.equal(buildSentence("el", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH"), null, {}),
    "Αυτός τρώει πρωινό αλλά όχι μεσημεριανό.");
  // Spanish keeps the generic shape; the meals are definite now.
  assert.equal(buildSentence("es", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH"), null, {}),
    "Él come el desayuno pero no el almuerzo.");
});

test("es: numeral ONE agrees and apocopates like the article (-75)", () => {
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "ONE", {}),
    "Yo obtengo un libro.");
  assert.equal(buildSentence("es", tplById("THEY_EAT_DINNER"), "ONE", {}),
    "Ellos comen una cena.");
  assert.equal(buildSentence("es", tplById("I_GET_BOOK"), "TWO", {}),
    "Yo obtengo dos libros.");
});

test("es: meals definite, HOME «a casa» / «en casa», ¿ on yes/no, personal a, dejar de", () => {
  assert.equal(buildSentence("es", tplById("I_EAT_BREAKFAST"), null, {}),
    "Yo como el desayuno.");
  assert.equal(buildSentence("es", tplById("I_GO_HOME"), null, {}),
    "Yo voy a casa.");
  assert.equal(buildSentence("es", tplById("IS_THAT_YOUR_PHONE"), null, {}),
    "¿Ese es tu teléfono?");
  assert.equal(buildSentence("es", tplById("I_GREET_WAITER"), null, {}),
    "Yo saludo a un camarero.");
  assert.equal(buildSentence("es", tplById("WE_STOP_EATING"), null, {}),
    "Nosotros dejamos de comer.");
  assert.equal(buildSentence("es", tplById("I_DO_THIS_BY_HAND"), null, {}),
    "Yo hago esto a mano.");
  assert.equal(buildSentence("es", tplById("MORNING_IS_GOOD"), null, {}),
    "La mañana es buena.");
});

test("el: meals and HOME bare, unaccented μια, by-hand «με το χέρι», MORNING neuter", () => {
  assert.equal(buildSentence("el", tplById("I_EAT_BREAKFAST"), null, {}),
    "Εγώ τρώω πρωινό.");
  assert.equal(buildSentence("el", tplById("I_GO_HOME"), null, {}),
    "Εγώ πηγαίνω σπίτι.");
  assert.equal(buildSentence("el", tplById("WE_HAVE_JOB"), null, {}),
    "Εμείς έχουμε μια δουλειά.");
  assert.equal(buildSentence("el", tplById("I_DO_THIS_BY_HAND"), null, {}),
    "Εγώ κάνω αυτό με το χέρι.");
  assert.equal(buildSentence("el", tplById("MORNING_IS_GOOD"), null, {}),
    "Το πρωί είναι καλό.");
  // A glue surface equal to the dictionary form is a no-op: uk keeps its
  // bare instrumental («рукою»), no «за допомогою» leaks in.
  assert.equal(buildSentence("uk", tplById("I_DO_THIS_BY_HAND"), null, {}),
    "Я роблю це рукою.");
});

test("ja: people count with 人 (-73); zh: 的 rides the counted phrase (-62 residual)", () => {
  assert.equal(buildSentence("ja", tplById("CX_HE_HAVE_SON"), "THREE", {}),
    "彼は三人の息子がいます。");
  assert.equal(buildSentence("ja", tplById("I_GET_BOOK"), "THREE", {}),
    "私は三冊の本を手に入れます。");
  assert.equal(buildSentence("zh", tplById("I_GET_BOOK"), "FOURTEEN", { adj_BOOK: "EASY" }),
    "我得到十四本容易的书。");
});

test("es: estar for location and home, compound prepositions with de/del (run-15 a+b)", () => {
  assert.equal(buildSentence("es", tplById("BOOK_ON_TABLE"), null, {}),
    "El libro está sobre la mesa.");
  assert.equal(buildSentence("es", tplById("PHONE_UNDER_TABLE"), null, {}),
    "El teléfono está debajo de la mesa.");
  assert.equal(buildSentence("es", tplById("BOOK_NEXT_TO_PHONE"), null, {}),
    "El libro está al lado del teléfono.");
  assert.equal(buildSentence("es", tplById("SHOES_UNDER_THIS"), null, {}),
    "Los zapatos están debajo de esto.");
  assert.equal(buildSentence("es", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"), null, {}),
    "Si él está en casa, él come con su hija.");
  // Identity predicates keep ser.
  assert.equal(buildSentence("es", tplById("THIS_IS_A_GOOD_BOOK"), null, {}),
    "Este es un buen libro.");
  // zh keeps its invariant 在 through the shared rule.
  assert.equal(buildSentence("zh", tplById("BOOK_ON_TABLE"), null, {}),
    "书在桌子上面。");
});

test("es: pronominal demonstratives are neuter, determined predicates agree (run-15 c)", () => {
  assert.equal(buildSentence("es", tplById("THIS_IS_MINE"), null, {}), "Esto es mío.");
  assert.equal(buildSentence("es", tplById("THIS_IS_THING"), null, {}), "Esto es una cosa.");
  assert.equal(buildSentence("es", tplById("THIS_IS_CORRECT"), null, {}), "Esto es correcto.");
  assert.equal(buildSentence("es", tplById("BOOK_BETWEEN_THIS_AND_THAT"), null, {}),
    "El libro está entre esto y eso.");
  assert.equal(buildSentence("es", tplById("THIS_IS_MY_HAND"), null, {}), "Esta es mi mano.");
  assert.equal(buildSentence("es", tplById("THAT_IS_YOUR_LEG"), null, {}), "Esa es tu pierna.");
});

test("el: σε + article contracts, compound prepositions carry σε/από, enclitic stress, «;»", () => {
  assert.equal(buildSentence("el", tplById("BOOK_ON_TABLE"), null, {}),
    "Το βιβλίο είναι πάνω στο τραπέζι.");
  assert.equal(buildSentence("el", tplById("BOOK_NEXT_TO_PHONE"), null, {}),
    "Το βιβλίο είναι δίπλα στο τηλέφωνο.");
  assert.equal(buildSentence("el", tplById("BOOK_BEHIND_PHONE"), null, {}),
    "Το βιβλίο είναι πίσω από το τηλέφωνο.");
  assert.equal(buildSentence("el", tplById("SHOES_IN_THIS"), null, {}),
    "Τα παπούτσια είναι μέσα σε αυτό.");
  assert.equal(buildSentence("el", tplById("SHE_GO_TO_HER_ROOM"), null, {}),
    "Αυτή πηγαίνει στο δωμάτιό της.");
  assert.equal(buildSentence("el", tplById("IS_THAT_YOUR_PHONE"), null, {}),
    "Είναι εκείνο το τηλέφωνό σου;");
  // Paroxytones stay unaccented; diphthongs count as one syllable.
  assert.equal(finalizeSentence("el", "Αυτό είναι το κεφάλι σου."),
    "Αυτό είναι το κεφάλι σου.");
  assert.equal(finalizeSentence("el", "Εγώ έχω το δρομολόγιο μου."),
    "Εγώ έχω το δρομολόγιό μου.");
  assert.equal(finalizeSentence("el", "Το βιβλίο μου είναι εδώ."),
    "Το βιβλίο μου είναι εδώ.");
});

test("el: direct and governed objects take the accusative — derived, article-borne (-77)", () => {
  // Masculine singular drops -ς; the indefinite article is έναν.
  assert.equal(buildSentence("el", tplById("I_GREET_WAITER"), null, {}),
    "Εγώ χαιρετώ έναν σερβιτόρο.");
  assert.equal(buildSentence("el", tplById("CX_HE_HAVE_BROTHER"), null, {}),
    "Αυτός έχει έναν αδερφό.");
  // The attributive adjective declines with it.
  assert.equal(buildSentence("el", tplById("I_GREET_WAITER"), "OLD", {}),
    "Εγώ χαιρετώ έναν παλιό σερβιτόρο.");
  // Possessed objects: the article carries the case (τον / τη(ν)).
  assert.equal(buildSentence("el", tplById("I_GREET_WAITER"), "MY", {}),
    "Εγώ χαιρετώ τον σερβιτόρο μου.");
  assert.equal(buildSentence("el", tplById("WE_EAT_SOUP"), "MY", {}),
    "Εμείς τρώμε τη σούπα μου.");
  assert.equal(buildSentence("el", tplById("HE_HAS_POT"), "HIS", {}),
    "Αυτός έχει την κατσαρόλα του.");
  // Counted masculine objects take the accusative plural.
  assert.equal(buildSentence("el", tplById("I_GREET_WAITER"), "TWO", {}),
    "Εγώ χαιρετώ δύο σερβιτόρους.");
  // Prepositions govern the accusative — «με τη μαμά του», «με την κόρη του».
  assert.ok(buildSentence("el", tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME"), null, {})
    .includes("με τη μαμά του"));
  assert.ok(buildSentence("el", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"), null, {})
    .includes("με την κόρη του"));
  // Predicate nominatives stay nominative.
  assert.equal(buildSentence("el", tplById("HE_IS_WAITER"), null, {}),
    "Αυτός είναι ένας σερβιτόρος.");
  assert.equal(buildSentence("el", tplById("SHE_IS_WOMAN"), null, {}),
    "Αυτή είναι μια γυναίκα.");
  // The L3 blank and its tile carry the accusative surface.
  const tpl = tplById("I_GREET_WAITER");
  const s = buildSentence("el", tpl, null, {});
  const blank = resolveNounBlank(s, tpl, "el", "WAITER");
  assert.equal(blank?.surface, "σερβιτόρο");
  assert.equal(optionSurfaceFor("el", tpl, "WAITER", slotContextFor(tpl, "el", "WAITER"),
    { bareMode: blank.bareMode }), "σερβιτόρο");
});

test("zh: prepositional adjuncts and 只 precede the verb, adjunct nominals bare (-72)", () => {
  assert.equal(buildSentence("zh", tplById("I_ORDER_MENU"), null, {}), "我从菜单点菜。");
  assert.equal(buildSentence("zh", tplById("I_READ_ONLY_BOOK"), null, {}), "我只读一本书。");
  assert.equal(buildSentence("zh", tplById("I_READ_ONLY_BOOK"), "BLACK", {}), "我只读一本黑书。");
  // Explicit template order goes through the same hook.
  assert.equal(buildSentence("zh", tplById("I_DO_THIS_BY_HAND"), null, {}), "我用手做这。");
  // Destinations stay after the verb; the comitative builder keeps 一起.
  assert.equal(buildSentence("zh", tplById("I_GO_TO_TABLE"), null, {}), "我去到一张桌子。");
  assert.ok(buildSentence("zh", tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME"), null, {})
    .startsWith("他和他的妈妈一起吃晚餐"));
  // Other languages are untouched.
  assert.equal(buildSentence("en", tplById("I_ORDER_MENU"), null, {}), "I order from a menu.");
  // The L3 blank follows the moved order.
  const tpl = tplById("I_ORDER_MENU");
  const s = buildSentence("zh", tpl, null, {});
  assert.equal(resolveNounBlank(s, tpl, "zh", "MENU")?.blanked, "我从_____点菜。");
});

test("two-clause templates keep both clauses in SVO languages (Emi run-16)", () => {
  assert.equal(buildSentence("en", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD"), null, {}),
    "This is my hand and this is your head.");
  assert.equal(buildSentence("es", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD"), null, {}),
    "Esta es mi mano y esta es tu cabeza.");
  assert.equal(buildSentence("es", tplById("SHE_IS_MY_MOM_AND_HE_IS_MY_DAD"), null, {}),
    "Ella es mi mamá y él es mi papá.");
  assert.equal(buildSentence("el", tplById("SHE_IS_MY_MOM_AND_HE_IS_MY_DAD"), null, {}),
    "Αυτή είναι η μαμά μου και αυτός είναι ο μπαμπάς μου.");
  assert.equal(buildSentence("fr", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD"), null, {}),
    "C'est ma main et c'est ta tête.");
  assert.equal(buildSentence("uk", tplById("SHE_IS_MY_MOM_AND_HE_IS_MY_DAD"), null, {}),
    "Вона моя мама і він мій тато.");
  // ja keeps its で-coordination builder.
  assert.equal(buildSentence("ja", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD"), null, {}),
    "これは私の手で、これはあなたの頭です。");
});

test("ar: a suffixed possessive fuses into the L3 blank and its tiles", () => {
  for (const id of ["HE_IS_MY_DAD", "SHE_IS_MY_MOM_AND_HE_IS_MY_DAD"]) {
    const tpl = tplById(id);
    const s = buildSentence("ar", tpl, null, {});
    const blank = resolveNounBlank(s, tpl, "ar", "DAD");
    assert.equal(blank?.surface, "أبي", id);
    assert.equal(optionSurfaceFor("ar", tpl, "DAD", slotContextFor(tpl, "ar", "DAD"),
      { bareMode: blank.bareMode }), "أبي", id);
  }
});

test("el: a multi-word masculine object declines every word (run-16 residual)", () => {
  assert.equal(buildSentence("el", tplById("SHE_SEES_CATHEDRAL"), null, {}),
    "Αυτή βλέπει έναν καθεδρικό ναό.");
  assert.equal(buildSentence("el", tplById("SHE_SEES_CATHEDRAL"), "TWO", {}),
    "Αυτή βλέπει δύο καθεδρικούς ναούς.");
});

test("es: a bare destination is definite, a modified one indefinite (run-16)", () => {
  assert.equal(buildSentence("es", tplById("I_GO_TO_TABLE"), null, {}), "Yo voy a la mesa.");
  assert.equal(buildSentence("es", tplById("I_GO_TO_TABLE"), "NEW", {}), "Yo voy a una mesa nueva.");
  assert.equal(buildSentence("es", tplById("I_GO_TO_HOUSE"), null, {}), "Yo voy a la casa.");
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
  // Template-slot path (authored possessive): «το χέρι μου» (HAND is
  // χέρι since Emi run-15 — παλάμη is the palm; ARM moved to μπράτσο).
  const s = buildSentence("el", tplById("THIS_IS_MY_HAND"));
  assert.ok(s.includes("το χέρι μου"), s);
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
  // Full sentences, per Emi's list — tr's indefinite `bir` fronts each
  // predicate noun after the 2026-08-30 declaration («Ben bir adamım»,
  // authored per sentence_templates.json).
  assert.equal(buildSentence("tr", tplById("I_AM_MAN")), "Ben bir adamım.");
  assert.equal(buildSentence("tr", tplById("YOU_ARE_GIRL")), "Sen bir kızsın.");
  assert.equal(buildSentence("tr", tplById("HE_IS_BOY")), "O bir oğlandır.");
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
    "negatorAgreement", "zeroPresentCopula", "definitenessAgreement",
    "possessiveSuffixes", "copulaPersonAgreement", "numeralGenderAgreement",
    "possessivePlacement", "verbGenderParadigm", "topicParticle",
    "classifiersOrCounters",
    "locativeCopula", "postposedAdpositions",
    "predicateColorNominalizer", "comitativeBeforeVerb",
    "postposedNumerals",
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
  assert.equal(buildSentence("ja", tplById("I_EAT_FOOD")), "私は食べ物を食べます。");
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

test("fi: attributive adjectives agree with the object's case", () => {
  // The adjective mirrors the case FIELD the head noun rendered —
  // partitive «uutta kirjaa», genitive-accusative «uuden puhelimen»
  // (Emi run-7 -28: zero inflected adjectives in 292 swept sentences).
  assert.equal(buildSentence("fi", tplById("YOU_READ_BOOK"), "NEW", {}),
    "Sinä luet uutta kirjaa.");
  assert.equal(buildSentence("fi", tplById("SHE_SEES_PHONE"), "NEW", {}),
    "Hän näkee uuden puhelimen.");
});

test("fi: numeral government reaches the adjective — partitive SINGULAR", () => {
  // Never the nominative plural «valkoiset» (the old code agreed with
  // the English number instead of the Finnish case).
  assert.equal(buildSentence("fi", tplById("YOU_READ_BOOK"), "WHITE", { num_BOOK: "EIGHT" }),
    "Sinä luet kahdeksan valkoista kirjaa.");
});

test("fi: an adjective without case data is refused as a modifier", () => {
  const entry = vocab.languages.fi.forms.NEW;
  const saved = entry.partitive;
  delete entry.partitive;
  try {
    assert.equal(isModifierCompatible("fi", "NEW", "BOOK"), false);
  } finally {
    entry.partitive = saved;
  }
  // With the data present the gate passes.
  assert.equal(isModifierCompatible("fi", "NEW", "BOOK"), true);
});

test("fi: the negation verb agrees in person and governs the partitive", () => {
  assert.equal(buildSentence("fi", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH")),
    "Hän syö aamiaisen mutta ei lounasta.");
  // 1pl subject: «emme», never the 3sg «ei» (Emi run-7 -31).
  const swapped = structuredClone(tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH"));
  swapped.concepts = swapped.concepts.map((c) => (c === "HE" ? "FIRST_PERSON_PLURAL" : c));
  assert.equal(buildSentence("fi", swapped),
    "Me syömme aamiaisen mutta emme lounasta.");
});

test("fi: «kanssa» is a postposed genitive adposition", () => {
  // Also exercises the reflexive possessive: «tyttärensä», never «hänen
  // tytär» — that names someone ELSE's daughter (Emi run-7 -30 + grading).
  assert.equal(buildSentence("fi", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER")),
    "Jos hän on kotona, hän syö tyttärensä kanssa.");
  assert.equal(buildSentence("fi", tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME")),
    "Hän syö illallisen äitinsä kanssa koska hän on kotona.");
});

test("fi: yes/no questions fuse the -ko/-kö clitic onto the fronted verb", () => {
  assert.equal(buildSentence("fi", tplById("IS_THAT_YOUR_PHONE")),
    "Onko tuo sinun puhelin?");
});

test("zh/ja/th: yes/no questions keep declarative order and add a final particle (Emi run-10 -51)", () => {
  const tpl = tplById("IS_THAT_YOUR_PHONE");
  // zh appends 吗？ after the declarative clause — never fronts 是.
  assert.equal(buildSentence("zh", tpl), "那是你的电话吗？");
  // ja pushes the copula to the end (SOV), inserts the topic particle は
  // inline, and closes with か. finalize adds the CJK sentence stop.
  assert.equal(buildSentence("ja", tpl), "それはあなたの電話ですか。");
  // th appends its tag particle ใช่ไหม with no terminal punctuation.
  assert.equal(buildSentence("th", tpl), "นั่นคือโทรศัพท์ของคุณใช่ไหม");
});

test("tr: yes/no questions append the mI particle harmonized on the last vowel (Dan cycle-26 preemptive)", () => {
  // SOV + zeroPresentCopula: subject + possessed noun + mI + ?. Turkish's
  // 4-way vowel harmony (same lookup the possessive-suffix generator uses)
  // picks mu/mü/mı/mi from the preceding word's last vowel — telefon ends
  // in -o (back rounded) → mu. The particle is a free word, space-
  // separated, never fused; capitalizeFirst keeps Ş uppercase.
  assert.equal(buildSentence("tr", tplById("IS_THAT_YOUR_PHONE")),
    "Şu senin telefon mu?");
});

test("zh: 是 stays before a possessive-headed noun predicate — 很 is adjectives only (Emi run-9 -36)", () => {
  // Possessives are typed as adjectives with semantic_role: 'possessive';
  // the zhCopulaOverride guard must fall through so «这是我的手» renders
  // 是, not «这很我的手» (the buggy zh-adjective route).
  assert.equal(buildSentence("zh", tplById("THIS_IS_MY_HAND")), "这是我的手。");
  assert.equal(buildSentence("zh", tplById("HE_IS_MY_DAD")), "他是我的爸爸。");
  assert.equal(buildSentence("zh", tplById("SHE_IS_MY_MOM")), "她是我的妈妈。");
});

test("fi: 3rd-person reflexive possession is a suffix in the slot's case", () => {
  assert.equal(buildSentence("fi", tplById("SHE_GO_TO_HER_ROOM")),
    "Hän menee huoneeseensa.");
  // Under a 3RD-person subject, a drilled 3rd-person possessive on a noun
  // WITHOUT possessed3 data is refused — «Hän näkee hänen puhelimen»
  // names someone else's phone, and wrong gets filtered (the modifier
  // simply does not land).
  assert.equal(buildSentence("fi", tplById("SHE_SEES_PHONE"), "HIS", {}),
    "Hän näkee puhelimen.");
  // Under a NON-3rd-person subject the same possessive is not reflexive
  // and renders normally («Sinä luet hänen kirjaa» — someone else's book,
  // which is exactly what it says).
  assert.equal(buildSentence("fi", tplById("YOU_READ_BOOK"), "HIS", {}),
    "Sinä luet hänen kirjaa.");
});

test("engine: adjective insertion never slices a mismatched noun (run-7 -34)", () => {
  // Plural possessed predicate + drilled adjective: the phrase/bare pair
  // previously mismatched («isät» vs «isä») and the length-based article
  // slice emitted a fragment of the noun itself («minun i pieni isä»,
  // "my d small dad").
  const tpl = {
    template_id: "X_WE_ARE_MY_DAD",
    concepts: ["FIRST_PERSON_PLURAL", "BE", "MY", "DAD"],
    render: { en: "We are my dads." },
  };
  assert.equal(buildSentence("en", tpl, "SMALL", {}), "We are my small dads.");
  assert.equal(buildSentence("fi", tpl, "SMALL", {}), "Me olemme minun pienet isät.");
});

// ---------------------------------------------------------------------
// zh: classifiers (measure words) — Emi -19 / run-9
// ---------------------------------------------------------------------

test("zh: English 'a' renders as 一 + the noun's classifier", () => {
  assert.equal(buildSentence("zh", tplById("HE_READ_BOOK")), "他读一本书。");
  assert.equal(buildSentence("zh", tplById("I_AM_MAN")), "我是一个男人。");
});

test("zh: mass and noArticle nouns stay bare", () => {
  assert.equal(nounPhrase("zh", "WATER"), "水");   // mass — no classifier data
  assert.equal(nounPhrase("zh", "PANTS"), "裤子"); // authored bare (noArticle)
});

test("zh: numerals count through the classifier, 两 replaces 二", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("zh", tpl, "FOUR", {}), "你读四本书。");
  assert.equal(buildSentence("zh", tpl, "TWO", {}), "你读两本书。");
  // Compound numerals keep 二 (十二本, never 十两本).
  assert.equal(buildSentence("zh", tpl, "TWELVE", {}), "你读十二本书。");
});

// ---------------------------------------------------------------------
// zh: colour predicate (是 X色的, not 很 X) — Emi run-9/run-6 -20
// ---------------------------------------------------------------------

test("zh: predicate colours take 是 + root + 色的 (Emi run-9/run-6 -20)", () => {
  // The nominalized-colour shape is what a native writes for "the X is
  // <colour>" — 是, then the colour stem, then 色的. Bare «很红» reads as
  // a stative "very red" and is the shipped bug the copula override
  // replaces.
  assert.equal(buildSentence("zh", tplById("BOOK_IS_RED")), "书是红色的。");
  assert.equal(buildSentence("zh", tplById("PHONE_IS_BLUE")), "电话是蓝色的。");
  assert.equal(buildSentence("zh", tplById("PANTS_ARE_BLACK")), "裤子是黑色的。");
});

test("zh: non-colour predicate adjectives keep 很 (LONG/HEAVY/EASY)", () => {
  // Colour is the special case; the rest of the property_* adjectives
  // stay on the stative 很 pattern authored throughout the corpus.
  assert.equal(buildSentence("zh", tplById("BOOK_IS_LONG")), "书很长。");
  assert.equal(buildSentence("zh", tplById("BOOK_IS_HEAVY")), "书很重。");
  assert.equal(buildSentence("zh", tplById("BOOK_IS_EASY")), "书很容易。");
});

// ---------------------------------------------------------------------
// zh: locative copula 在 + postposed position — Emi run-9 -39
// ---------------------------------------------------------------------

test("zh: spatial_relation uses 在 and postposes the position (Emi run-9 -39)", () => {
  // The shipped bug rendered «书是在上面桌子» — 是 for 在, position glue
  // before the ground noun, indefinite «一张桌子» for the definite
  // landmark. All three retire in one PR: the copula becomes 在, the
  // position glue lands after the noun (postposedAdpositions in
  // RELATIONAL_STRUCTURES), and the landmark reads definite/bare.
  assert.equal(buildSentence("zh", tplById("BOOK_ON_TABLE")), "书在桌子上面。");
  assert.equal(buildSentence("zh", tplById("PHONE_UNDER_TABLE")), "电话在桌子下面。");
  assert.equal(buildSentence("zh", tplById("BOOK_NEXT_TO_TABLE")), "书在桌子旁边。");
  assert.equal(buildSentence("zh", tplById("PHONE_ON_THAT")), "电话在那上面。");
});

test("zh: 'he is home' subclause takes 在, not 是 (Emi run-9 -39)", () => {
  // The place-semantic noun is what routes buildSubjectBeNounClause into
  // the locative copula for the sub-clause of a complex_clause template.
  const tpl = tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER");
  const rendered = buildSentence("zh", tpl);
  assert.ok(rendered.includes("他在家"), rendered);
  assert.ok(!rendered.includes("他是家"), rendered);
});

// ---------------------------------------------------------------------
// zh: comitative WITH-phrase precedes the verb with 一起 — Emi run-9 -40
// ---------------------------------------------------------------------

test("zh: 'with X' moves before the verb with 一起 (Emi run-9 -40)", () => {
  // English «V O with X» ships to Chinese as «WITH X 一起 V O», the
  // authored corpus's shape throughout. Both the object-carrying and
  // objectless complex-clause main-clause builders take the reorder.
  const withObject = buildSentence("zh",
    tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME"));
  assert.ok(withObject.includes("他和他的妈妈一起吃晚餐"), withObject);
  const withoutObject = buildSentence("zh",
    tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"));
  assert.ok(withoutObject.includes("他和他的女儿一起吃"), withoutObject);
});

// ---------------------------------------------------------------------
// ko: counters follow the noun, numerals take determiner forms — Emi -14
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Emi run-17: ko -81 … -85 (the four templates left after the run-6 repair).
// ---------------------------------------------------------------------

test("ko: control-verb chains read the authored complement + finite verb (Emi run-17 -83)", () => {
  assert.equal(buildSentence("ko", tplById("WE_STOP_EATING")), "우리는 먹는 것을 멈춰요.");
  assert.equal(buildSentence("ko", tplById("THEY_START_SLEEPING")), "그들은 자기 시작해요.");
});

test("ko: V-AND-V coordinates on the -고 stem, no 그리고 (Emi run-17 -84)", () => {
  assert.equal(buildSentence("ko", tplById("I_EAT_AND_DRINK")), "저는 먹고 마셔요.");
});

test("ko: two copular clauses chain on 이고, suffix copula on the last predicate (Emi run-17 -84)", () => {
  assert.equal(buildSentence("ko", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD")),
    "이것은 제 손이고 이것은 당신의 머리예요.");
  assert.equal(buildSentence("ko", tplById("SHE_IS_MY_MOM_AND_HE_IS_MY_DAD")),
    "그녀는 제 엄마이고 그는 제 아빠예요.");
  // The first clause's predicate blank/tile carries the connective too.
  assert.equal(safeSurfaceForConcept(tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD"), "ko", "HAND"), "손이고");
});

test("ko: 'but not' — 지만 on the stem, topic on O2, 안 + finite verb (Emi run-17 -81)", () => {
  const tpl = tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH");
  assert.equal(buildSentence("ko", tpl), "그는 아침식사를 먹지만 점심식사는 안 먹어요.");
  assert.equal(safeSurfaceForConcept(tpl, "ko", "BREAKFAST"), "아침식사를");
  assert.equal(safeSurfaceForConcept(tpl, "ko", "LUNCH"), "점심식사는");
});

test("ko: spatial relations render as existence — head 은/는, landmark 에, 있어요 (Emi run-17 -82)", () => {
  assert.equal(buildSentence("ko", tplById("BOOK_NEXT_TO_PHONE")), "책은 전화 옆에 있어요.");
  assert.equal(buildSentence("ko", tplById("BOOK_BEHIND_PHONE")), "책은 전화 뒤에 있어요.");
  assert.equal(buildSentence("ko", tplById("BOOK_BETWEEN_THIS_AND_THAT")), "책은 이것과 그것 사이에 있어요.");
  assert.equal(safeSurfaceForConcept(tplById("BOOK_BETWEEN_THIS_AND_THAT"), "ko", "BOOK"), "책은");
  assert.equal(safeSurfaceForConcept(tplById("BOOK_BETWEEN_THIS_AND_THAT"), "ko", "THIS"), "이것과");
});

test("ko: a verb that incorporates its object leaves the noun bare (Emi run-17 -85)", () => {
  assert.equal(buildSentence("ko", tplById("I_PEEL_POTATO")), "저는 감자 껍질을 벗겨요.");
  assert.equal(safeSurfaceForConcept(tplById("I_PEEL_POTATO"), "ko", "POTATO"), "감자");
  assert.equal(buildSentence("ko", tplById("I_PHOTOGRAPH_MONUMENT")), "저는 기념비 사진을 찍어요.");
});

// ---------------------------------------------------------------------
// Emi run-18: ko -86 / -87 / -88 residuals after the run-17 batch.
// ---------------------------------------------------------------------

test("ko: 앞 and 안 carry 에 like every other position (Emi run-18 -86)", () => {
  assert.equal(buildSentence("ko", tplById("PHONE_IN_FRONT_OF_BOOK")), "전화는 책 앞에 있어요.");
  assert.equal(buildSentence("ko", tplById("SHOES_IN_THIS")), "신발은 이것 안에 있어요.");
});

test("ko: per-noun counters for houses, shoes, clothes, phones; 스물 → 스무 (Emi run-18 -87)", () => {
  assert.equal(buildSentence("ko", tplById("I_SEE_HOUSE"), "EIGHT", {}), "저는 집 여덟 채를 봐요.");
  assert.equal(buildSentence("ko", tplById("SHE_HAS_SHOES"), "NINETEEN", {}), "그녀는 신발 열아홉 켤레가 있어요.");
  assert.equal(buildSentence("ko", tplById("I_HAVE_SHIRT"), "TWENTY", {}), "저는 셔츠 스무 벌이 있어요.");
  assert.equal(buildSentence("ko", tplById("I_USE_PHONE"), "TWELVE", {}), "저는 전화 열두 대를 사용해요.");
});

test("ko: adverbial glue — 주변에 가요, 먼저 먹어요 (Emi run-18 -88)", () => {
  assert.equal(buildSentence("ko", tplById("I_GO_AROUND")), "저는 주변에 가요.");
  assert.equal(buildSentence("ko", tplById("I_EAT_BEFORE")), "저는 먼저 먹어요.");
});

test("ko: numeral + counter follow the noun, particle lands on the counter", () => {
  const tpl = tplById("YOU_READ_BOOK");
  assert.equal(buildSentence("ko", tpl, "FOUR", {}), "당신은 책 네 권을 읽어요.");
  assert.equal(buildSentence("ko", tpl, "TWO", {}), "당신은 책 두 권을 읽어요.");
  // Compounds inflect through the same ending replacement (열둘 → 열두).
  assert.equal(buildSentence("ko", tpl, "TWELVE", {}), "당신은 책 열두 권을 읽어요.");
  // 5+ native numerals are already their own determiner form.
  assert.equal(buildSentence("ko", tpl, "FIVE", {}), "당신은 책 다섯 권을 읽어요.");
});

test("ko: indefinite 'a' takes no counter (authored: «책을 읽어요»)", () => {
  assert.equal(buildSentence("ko", tplById("HE_READ_BOOK")), "그는 책을 읽어요.");
});

// ---------------------------------------------------------------------
// SOV particle alignment: the first-noun workaround retired with -14/-19
// ---------------------------------------------------------------------

test("ko: no-pronoun template topics the subject and marks the object", () => {
  const tpl = tplById("POKEMON_HAVE_MOVE");
  assert.equal(buildSentence("ko", tpl), "포켓몬은 기술이 있어요.");
  // Tiles mirror the render exactly: the object slot carries the
  // existential 이/가, and slotContextFor finds the object SOV-aware.
  const objSlot = slotContextFor(tpl, "ko", "MOVE");
  assert.equal(objSlot.position, "directObject");
  assert.equal(optionSurfaceFor("ko", tpl, "MOVE", objSlot, {}), "기술이");
});

test("fi: hidden in the registry until the gate passes", () => {
  const fi = AVAILABLE_LANGUAGES.find((l) => l.code === "fi");
  assert.ok(fi, "fi must be registered (validators see it)");
  assert.equal(fi.hidden, true);
  assert.equal(fi.beta, true);
});

// ---------------------------------------------------------------------
// Emi run-10 Japanese structural fixes (-45…-50, counters, register).
// ---------------------------------------------------------------------

test("ja: copular clauses end on the copula, subject topic-marked (Emi run-10 -45)", () => {
  assert.equal(buildSentence("ja", tplById("THIS_IS_MY_HAND")), "これは私の手です。");
  assert.equal(buildSentence("ja", tplById("THIS_IS_A_GOOD_BOOK")), "これは良い本です。");
  assert.equal(buildSentence("ja", tplById("THAT_IS_YOUR_LEG")), "それはあなたの脚です。");
});

test("ja: control-verb chains compound with the complement first (Emi run-10 -46)", () => {
  assert.equal(buildSentence("ja", tplById("THEY_START_SLEEPING")), "彼らは寝始めます。");
  assert.equal(buildSentence("ja", tplById("WE_STOP_EATING")), "私たちは食べるのをやめます。");
});

test("ja: V-AND-V coordinates through the te form, no そして (Emi run-10 -47)", () => {
  assert.equal(buildSentence("ja", tplById("I_EAT_AND_DRINK")), "私は食べて飲みます。");
});

test("ja: HAVE splits by noun — transitive 持っています vs existential があります (Emi run-10 -48)", () => {
  assert.equal(buildSentence("ja", tplById("SHE_HAS_SHOES")), "彼女は靴を持っています。");
  assert.equal(buildSentence("ja", tplById("SHE_HAS_MEETING")), "彼女は会議があります。");
});

test("ja: bare motion goals take に and adpositions postpose (Emi run-10 -49)", () => {
  assert.equal(buildSentence("ja", tplById("I_GO_HOME")), "私は家に帰ります。");
  assert.equal(buildSentence("ja", tplById("I_GO_TO_TABLE")), "私はテーブルに行きます。");
  assert.equal(buildSentence("ja", tplById("I_GO_FROM_HOME")), "私は家から行きます。");
});

test("ja/zh: 'but not' renders the contrastive negation (Emi run-10 -50 / run-9 -37)", () => {
  assert.equal(buildSentence("ja", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH")),
    "彼は朝ご飯を食べますが、昼ご飯は食べません。");
  assert.equal(buildSentence("zh", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH")),
    "他吃早餐，但是不吃午餐。");
});

test("ja: per-noun counters win over the generic 個/つ (Emi run-10 counter table)", () => {
  assert.equal(jaQuantifierPrefix("ja", "TWO", "二", "BOOK"), "二冊の");
  assert.equal(jaQuantifierPrefix("ja", "SEVENTEEN", "十七", "PHONE"), "十七台の");
  // a noun with no counter field keeps the kun つ for 1-9 …
  assert.equal(jaQuantifierPrefix("ja", "TWO", "二", "FOOD"), "二つの");
  // … and the declared default above nine.
  assert.equal(jaQuantifierPrefix("ja", "FIFTEEN", "十五", "FOOD"), "十五個の");
});

test("ja: generated verbs are polite ます, matching the authored corpus (Emi run-10 register)", () => {
  assert.equal(buildSentence("ja", tplById("HE_READ_BOOK")), "彼は本を読みます。");
  assert.equal(buildSentence("ja", tplById("SHE_HAS_SHOES")).endsWith("います。"), true);
});

test("ar: yes/no questions front هل and close with the Arabic ؟ (Emi run-11 -54)", () => {
  const q = buildSentence("ar", tplById("IS_THAT_YOUR_PHONE"));
  assert.equal(q.startsWith("هل "), true);
  assert.equal(q.endsWith("؟"), true);
  assert.equal(q.includes("?"), false);
});

// ---------------------------------------------------------------------
// Emi Arabic fixes: -16 possessive suffixes, -52 demonstrative gender,
// -53 verb-governed prepositions.
// ---------------------------------------------------------------------

test("ar: possessives fuse as suffixes on the noun, dative word gone (Emi -16)", () => {
  assert.equal(buildSentence("ar", tplById("THIS_IS_MY_HAND")), "هذه يدي.");
  assert.equal(buildSentence("ar", tplById("SHE_IS_MY_MOM")), "هي أمي.");
  assert.equal(buildSentence("ar", tplById("HE_IS_MY_DAD")), "هو أبي.");
  // ta marbuta opens before the suffix: غرفة → غرفتها
  assert.equal(buildSentence("ar", tplById("SHE_GO_TO_HER_ROOM")),
    "هي تذهب إلى غرفتها.");
  // the dedicated question builder reaches possession through
  // nounWithPossessive — «هاتفك», matching the authored render exactly
  assert.equal(buildSentence("ar", tplById("IS_THAT_YOUR_PHONE")),
    "هل ذلك هاتفك؟");
});

test("ar: demonstratives agree with the predicate noun's gender (Emi run-11 -52)", () => {
  // يد is feminine in the data → هذه; ذراع is masculine in the data → ذلك
  assert.equal(buildSentence("ar", tplById("THIS_IS_MY_HAND")), "هذه يدي.");
  assert.equal(buildSentence("ar", tplById("THAT_IS_MY_ARM")), "ذلك ذراعي.");
  // ساق is feminine in the data → تلك (the authored render still carries
  // ذلك — flagged to Emi as an authored-line inconsistency, data wins)
  assert.equal(buildSentence("ar", tplById("THAT_IS_YOUR_LEG")), "تلك ساقك.");
});

test("ar: the numeral 'one' postposes as an appositive (Emi 2026-08-28-17)", () => {
  // «واحد كتاب» → «كتاب واحد»: 1 follows the noun like an adjective. Higher
  // numerals stay pre-nominal (3-10 polarity is the queued mechanism; the
  // divergence baseline still owns those rows).
  assert.equal(
    buildSentence("ar", tplById("SHE_SEES_PHONE"), null, { num_PHONE: "ONE" }),
    "هي ترى هاتف واحد.",
  );
  // With an adjective the order is noun + adjective + numeral («هاتف أبيض
  // واحد»): the appositive numeral sits after both modifiers, and the
  // adjective still agrees in gender with the head noun.
  assert.equal(
    buildSentence("ar", tplById("SHE_SEES_PHONE"), null,
      { num_PHONE: "ONE", adj_PHONE: "WHITE" }),
    "هي ترى هاتف أبيض واحد.",
  );
  // Control: higher numerals are NOT postposed (the allowlist is ["ONE"]
  // only — 3-10 reverse-gender polarity is the queued 2026-08-28-17
  // coverage gap that keeps the baseline row).
  assert.equal(
    buildSentence("ar", tplById("SHE_SEES_PHONE"), null, { num_PHONE: "NINE" }),
    "هي ترى تسعة هاتف.",
  );
});

test("ar: the verb's own government supplies the preposition (Emi run-11 -53)", () => {
  assert.equal(buildSentence("ar", tplById("I_GET_BOOK")), "أنا أحصل على كتاب.");
  assert.equal(buildSentence("ar", tplById("WE_STOP_EATING")), "نحن نتوقف عن الأكل.");
  assert.equal(buildSentence("ar", tplById("I_GO_HOME")), "أنا أذهب إلى المنزل.");
  // an explicit glue word already carries the relation — no doubling
  assert.equal(buildSentence("ar", tplById("I_GO_TO_TABLE")), "أنا أذهب إلى طاولة.");
  // a time complement is not verb-governed
  assert.equal(buildSentence("ar", tplById("WE_GO_TOMORROW")), "نحن نذهب غداً.");
});

// ---------------------------------------------------------------------
// Emi run-12: ja -57/-58/-59/-60 + comma, ar -53 residual / -56.
// ---------------------------------------------------------------------

test("ja: spatial relations render as existence — head は landmark の position あります (Emi run-12 -57)", () => {
  assert.equal(buildSentence("ja", tplById("BOOK_ON_THIS")), "本はこれの上にあります。");
  assert.equal(buildSentence("ja", tplById("BOOK_BEHIND_PHONE")), "本は電話の後ろにあります。");
  assert.equal(buildSentence("ja", tplById("BOOK_BETWEEN_THIS_AND_THAT")),
    "本はこれとそれの間にあります。");
});

test("ja: HAVE with a person takes the animate existence verb がいます (Emi run-12 -58)", () => {
  assert.equal(buildSentence("ja", tplById("CX_HE_HAVE_SON")), "彼は息子がいます。");
  assert.equal(buildSentence("ja", tplById("SHE_HAS_MEETING")), "彼女は会議があります。");
  assert.equal(buildSentence("ja", tplById("SHE_HAS_SHOES")), "彼女は靴を持っています。");
});

test("ja: noun-class colours link with の, い-adjectives attach bare (Emi run-12 -59)", () => {
  assert.equal(buildSentence("ja", tplById("HE_SEES_SHIRT"), null, { adj_SHIRT: "PURPLE" }),
    "彼は紫のシャツを見ます。");
  assert.equal(buildSentence("ja", tplById("HE_SEES_SHIRT"), null, { adj_SHIRT: "WHITE" }),
    "彼は白いシャツを見ます。");
});

test("ja: a possessed destination keeps に after the whole phrase (Emi run-12 -60)", () => {
  assert.equal(buildSentence("ja", tplById("SHE_GO_TO_HER_ROOM")), "彼女は彼女の部屋に行きます。");
});

test("ja/zh: clause commas are the script's own (Emi run-12)", () => {
  const ja = buildSentence("ja", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"));
  assert.equal(ja.includes("、"), true);
  assert.equal(ja.includes(","), false);
  const zh = buildSentence("zh", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER"));
  assert.equal(zh.includes("，"), true);
  assert.equal(zh.includes(","), false);
});

test("ar: derived profession nouns take the feminine after a feminine subject (Emi run-12 -56)", () => {
  assert.equal(buildSentence("ar", tplById("SHE_IS_GUIDE")), "هي مرشدة.");
  assert.equal(buildSentence("ar", tplById("HE_IS_WAITER")), "هو نادل.");
});

test("ar: pack verb government — على / بـ / في, past a possessive (Emi run-12 -53 residual)", () => {
  assert.equal(buildSentence("ar", tplById("I_INSURE_LUGGAGE")), "أنا أؤمن على أمتعتي.");
  assert.equal(buildSentence("ar", tplById("I_RECOMMEND_RESTAURANT")), "أنا أوصي بـ مطعم.");
  assert.equal(buildSentence("ar", tplById("I_NAVIGATE_ROUTE")), "أنا أتنقل في مسار.");
});

// ---------------------------------------------------------------------
// ja two-clause templates (carried since Emi run 10; run-12 known-open).
// ---------------------------------------------------------------------

test("ja: 'X is A and Y is B' chains on the connective copula で (copulaCoordination)", () => {
  assert.equal(buildSentence("ja", tplById("THIS_IS_MY_HAND_AND_THIS_IS_YOUR_HEAD")),
    "これは私の手で、これはあなたの頭です。");
  assert.equal(buildSentence("ja", tplById("SHE_IS_MY_MOM_AND_HE_IS_MY_DAD")),
    "彼女は私の母で、彼は私の父です。");
});

test("ja: subordinate clause leads with a clause-final linker; locative existence; SOV main clause", () => {
  assert.equal(buildSentence("ja", tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME")),
    "彼は家にいますので、彼の母と夕ご飯を食べます。");
  // IF: clause-initial もし, が on the subordinate subject, conditional いたら.
  assert.equal(buildSentence("ja", tplById("IF_HE_IS_HOME_HE_EATS_WITH_HIS_DAUGHTER")),
    "もし彼が家にいたら、彼の娘と食べます。");
});
