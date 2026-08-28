// language_rules.mjs
//
// Per-language grammar rule declarations for the sentence engine.
//
// THE CONTRACT (2026-08-27 architecture ruling): every language the app
// ships MUST have a row here, and every grammar behaviour the engine
// branches on per-language MUST be driven by a flag in that row — never by
// a language-code check buried in a render path. Adding a language is a
// content job (forms, renders, packs) PLUS a rules job (this file, plus
// per-language tests in tests/unit/language_rules.test.mjs). A missing row
// fails the unit suite, so a new language cannot ship with this file
// untouched.
//
// Why this exists: the Italian launch shipped with three high-severity
// grammar defects (possessives without their definite article, doubled
// indefinite articles in fill-in-the-blank, numbers on mass nouns) that
// were the same defect classes already fixed for Japanese — the fixes were
// written as language-specific branches, so the next language arrived with
// the class untouched. Declaring rules here makes the engine ask "which
// languages do X?" instead of "is this Japanese?".
//
// Flag meanings:
//   indefiniteArticle        noun phrases take an indefinite article
//                            ("a book", «un libro»). Drives ARTICLE_LANGS.
//   postNominalAdjectives    attributive adjectives follow the noun by
//                            default («casa grande»). Drives
//                            POST_ADJECTIVE_LANGS.
//   zeroPresentCopula        present-tense "to be" is dropped or suffixed
//                            («Це телефон», "O bir öğrenci"). Drives
//                            ZERO_PRESENT_COPULA.
//   spacelessJoin            words join with no spaces (Thai). Drives
//                            SPACELESS_JOIN_LANGS.
//   spacelessTiles           L6 tiles cannot split on whitespace (ja/zh/th).
//                            Drives SPACELESS_TILE_LANGS.
//   possessiveDefiniteArticle
//                            possessed noun phrases take the definite
//                            article («la mia mano», «il suo taxi») except
//                            nouns flagged noArticleWithPossessive in the
//                            language data (Italian singular family nouns).
//                            Applied on EVERY render path that emits a
//                            possessive + noun pair.
//   proDrop                  dropping the subject pronoun is standard
//                            («Leggiamo un libro») — the free-translation
//                            grader must accept the pronoun-dropped form of
//                            the reference answer. The GENERATOR still
//                            teaches the explicit-pronoun form (deliberate
//                            beginner pedagogy — Dan ruling 2026-08-27).
//                            Declared only where the grader's
//                            pronoun-stripping is implemented and tested;
//                            ja/ko/zh also drop pronouns but need
//                            particle-aware stripping first.
//   flexibleAdjectiveOrder   both adjective orders are grammatical («un
//                            libro vecchio» / «un vecchio libro») — the
//                            grader accepts both; the generator keeps
//                            teaching the post-nominal default (Dan ruling
//                            2026-08-27: do not re-teach, just stop the
//                            false negative).
//   wordOrder                "SOV" | "VSO"; omit for SVO (the default).
//                            Drives clause ordering in the engine.
//   secondPersonAsThird      2nd-person subjects conjugate with 3rd-person
//                            morphology (pt você/vocês).
//   caseMarking              the language declines nominals. An object:
//                              directObjectCase:  case a direct object takes
//                                                 ("accusative")
//                              prepositions:      { PREP_CONCEPT: caseName }
//                                                 — case each preposition
//                                                 governs
//                              femAccusativeStrategy: named engine fallback
//                                                 for feminine accusatives
//                                                 when the entry has no
//                                                 explicit `accusative`
//                                                 field ("uk": -а/-я→-у/-ю;
//                                                 "pl": noun -a→-ę, adj
//                                                 -a→-ą). Explicit data
//                                                 always wins.
//                              bareInstrumentalMeans: BY drops when the
//                                                 following nominal carries
//                                                 an instrumental («роблю
//                                                 це рукою»)
//                              predicateNounCase: case a predicate NOUN
//                                                 takes after the copula
//                                                 («Jestem mężczyzną» —
//                                                 predicate adjectives stay
//                                                 nominative)
//                            Case forms live in the language data as fields
//                            named by case (accusative/genitive/locative/
//                            instrumental/…); a missing field falls back to
//                            the nominative, which validate-exercise-
//                            surfaces ratchets as CASE_FALLBACK.
//   numeralGenitivePlural    numbers five and above govern the genitive
//                            plural («pięć książek») — the noun entry's
//                            `genitive_plural` field; a number is skipped
//                            (compat-gated) when the field is missing.
//   statementOrderQuestion   yes/no questions keep declarative order and
//                            ask with intonation («Esse é o seu
//                            telefone?») instead of fronting the copula.
//   questionParticle         yes/no questions keep declarative order
//                            behind this fronted particle («Czy to jest
//                            twój telefon?»).
//   preNominalAdjectiveRoles adjective semantic_role values placed BEFORE
//                            the noun in a postNominalAdjectives language
//                            («un bon livre» while «un livre noir») — the
//                            role-aware refinement of the position
//                            default. Per-word escapes: preNominal /
//                            postNominal on the form entry.
//   apocope                  pre-nominal masc-singular adjectives use the
//                            entry's `apocope` short form («buen libro»,
//                            «buon libro»).
//   virilePlural             plural agreement splits virile/non-virile:
//                            nouns flag `virile: true`, adjectives carry a
//                            `vp` (virile plural) form («nowi» vs «nowe»).
//
// ── features: the grammar coverage matrix ────────────────────────────────
// Each row also declares `features` — LINGUISTIC FACTS about the language
// (what it NEEDS), as opposed to the flags above (what the engine DOES).
// validate-grammar-coverage.mjs fails when a needed feature has no
// implementing rule/data, and hard-fails when an implementing flag exists
// with no declared feature (stale matrix). This is what turns "has a row"
// into "has the RIGHT row": de/fr/es shipped broken with green CI because
// the old contract only checked that a row existed (Emi 2026-08-27 sweep).
//
//   indefiniteArticle          noun phrases need an indefinite article
//   marksCaseOnDirectObjects   direct objects change form (or their
//                              determiner does)
//   marksCaseAfterPrepositions prepositions govern a case
//   predicateNounCase          predicate nouns take a non-nominative case
//   declinesAttributiveAdjectives
//                              attributive adjectives agree (gender/number
//                              at minimum) — implemented by agreement DATA
//                              (`f` fields on adjectives) or a declared
//                              adjectiveDeclension strategy
//   adjectivePosition          "pre" | "post" | "roleBased" — where
//                              attributive adjectives go; "post"/"roleBased"
//                              need postNominalAdjectives (+ role list)
//   apocope                    some adjectives shorten pre-nominally
//                              («buen libro», «buon libro»)
//   articleCaseMarking         case is realized on the determiner (de/el)
//   virilePlural               masculine-personal plural agreement
//   numeralGovernment          numerals govern a noun case
//   zeroPresentCopula          present-tense "to be" is dropped/suffixed
//   definitenessAgreement      adjectives agree in definiteness (ar)
//
// Validator-membership flags (single source for lists that used to be
// hardcoded in validation/*.js — memberships preserved exactly):
//   inflectsNounPlural       countable nouns inflect for number
//                            (validate-injection PLURAL_LANGS)
//   fullNounGender           every noun must carry gender
//                            (validate-packs FULL_GENDER_LANGS)
//   nounGenderForCountables  countable nouns should carry gender — warning
//                            class (validate-packs GENDER_REQUIRED_LANGS /
//                            validate-structure)
//   verbPersonParadigm       verbs need the full six-cell person paradigm
//                            (validate-packs VERB_PERSON_LANGS)
//   latinEncodingChecks      run the Latin-script mojibake checks
//                            (validate-encoding LATIN_LANGS)
//   possessiveSuffixes       the possessed noun in the have-construction
//                            carries a person-agreeing suffix, generated by
//                            the regular paradigm unless the entry's
//                            `possessed` map overrides («Benim yiyeceğim
//                            var» — tr today)
//   copulaPersonSuffixes     predicate nominals take personal copular
//                            endings by subject person/number; -DIr only in
//                            3sg («Ben adamım», «Onlar kızlar» — tr today)
//   numeralGenderAgreement   number words agree with the head noun's gender
//                            (and case, for ONE) via object-shaped number
//                            entries: f / n / m / f_accusative fields
//                            («дві сковороди», «одну роботу», «μία» /
//                            «τρεις» / «δεκατέσσερις» — uk, el)

export const LANGUAGE_RULES = {
  ar: {
    features: {
      adjectivePosition: "post", zeroPresentCopula: true,
      declinesAttributiveAdjectives: true, definitenessAgreement: true,
    },
    postNominalAdjectives: true, zeroPresentCopula: true,
    inflectsNounPlural: true, fullNounGender: true,
    nounGenderForCountables: true, verbPersonParadigm: true,
  },
  en: {
    features: {
      indefiniteArticle: true, adjectivePosition: "pre",
    },
    indefiniteArticle: true,
    inflectsNounPlural: true, latinEncodingChecks: true,
  },
  fr: {
    features: {
      indefiniteArticle: true, adjectivePosition: "roleBased",
      declinesAttributiveAdjectives: true,
    },
    indefiniteArticle: true,
    postNominalAdjectives: true,
    preNominalAdjectiveRoles: [
      "property_size", "property_quality", "property_time", "property_youth",
    ],
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  de: {
    features: {
      indefiniteArticle: true, adjectivePosition: "pre",
      marksCaseOnDirectObjects: true, marksCaseAfterPrepositions: true,
      articleCaseMarking: true, declinesAttributiveAdjectives: true,
    },
    indefiniteArticle: true,
    // German marks case on the DETERMINER (ein→einen/einem, der→den/dem),
    // not as a noun suffix — caseOn: "determiner" routes the case
    // machinery to the article emitters instead of noun fields. Attributive
    // adjective endings come from the "german" declension strategy
    // (weak/mixed/strong × gender × case); adjective entries stay
    // stem-only {form, plural} — never author gender/case variants.
    // Corpus scope: nominative/accusative/dative (no genitive templates).
    adjectiveDeclension: "german",
    caseMarking: {
      directObjectCase: "accusative",
      caseOn: "determiner",
      prepositions: {
        ON: "dative", IN: "dative", OFF: "dative",
        UNDER: "dative", BEHIND: "dative", FRONT: "dative",
        BETWEEN: "dative", NEXT_TO: "dative", BY: "dative",
        WITH: "dative", TO: "dative", FROM: "dative",
        FOR: "accusative",
      },
    },
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true, latinEncodingChecks: true,
  },
  el: {
    features: {
      indefiniteArticle: true, adjectivePosition: "pre",
      marksCaseOnDirectObjects: true, articleCaseMarking: true,
      declinesAttributiveAdjectives: true,
      // 1, 3, 4 (and their -teen compounds) inflect for gender:
      // «δεκατέσσερις κρατήσεις», never «δεκατέσσερα κρατήσεις»
      // (Emi 2026-08-28-03).
      numeralGenderAgreement: true,
    },
    indefiniteArticle: true,
    inflectsNounPlural: true, fullNounGender: true,
    verbPersonParadigm: true,
    numeralGenderAgreement: true,
  },
  it: {
    features: {
      indefiniteArticle: true, adjectivePosition: "roleBased",
      declinesAttributiveAdjectives: true, apocope: true,
    },
    indefiniteArticle: true,
    postNominalAdjectives: true,
    preNominalAdjectiveRoles: ["property_quality"],
    apocope: true,
    possessiveDefiniteArticle: true,
    proDrop: true,
    flexibleAdjectiveOrder: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  ja: {
    features: { adjectivePosition: "pre" }, spacelessTiles: true, wordOrder: "SOV" },
  ko: {
    features: { adjectivePosition: "pre" }, wordOrder: "SOV" },
  zh: {
    features: { adjectivePosition: "pre" }, spacelessTiles: true },
  no: {
    features: {
      indefiniteArticle: true, adjectivePosition: "pre",
      declinesAttributiveAdjectives: true,
    },
    indefiniteArticle: true,
    inflectsNounPlural: true, latinEncodingChecks: true,
  },
  pl: {
    features: {
      adjectivePosition: "pre",
      marksCaseOnDirectObjects: true, marksCaseAfterPrepositions: true,
      predicateNounCase: true, declinesAttributiveAdjectives: true,
      virilePlural: true, numeralGovernment: true,
    },
    proDrop: true,
    questionParticle: "Czy",
    virilePlural: true,
    numeralGenitivePlural: true,
    inflectsNounPlural: true, fullNounGender: true,
    nounGenderForCountables: true, verbPersonParadigm: true,
    latinEncodingChecks: true,
    caseMarking: {
      directObjectCase: "accusative",
      prepositions: {
        ON: "locative", IN: "locative", OFF: "locative",
        UNDER: "instrumental", BEHIND: "instrumental", FRONT: "instrumental",
        BETWEEN: "instrumental", WITH: "instrumental",
        BY: "instrumental",
        NEXT_TO: "genitive", TO: "genitive", FROM: "genitive",
        FOR: "genitive",
      },
      femAccusativeStrategy: "pl",
      bareInstrumentalMeans: true,
      predicateNounCase: "instrumental",
    },
  },
  pt: {
    features: {
      indefiniteArticle: true, adjectivePosition: "roleBased",
      declinesAttributiveAdjectives: true,
    },
    indefiniteArticle: true, postNominalAdjectives: true, proDrop: true,
    preNominalAdjectiveRoles: ["property_quality"],
    secondPersonAsThird: true, statementOrderQuestion: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true, latinEncodingChecks: true,
  },
  es: {
    features: {
      indefiniteArticle: true, adjectivePosition: "roleBased",
      declinesAttributiveAdjectives: true, apocope: true,
    },
    indefiniteArticle: true, proDrop: true, statementOrderQuestion: true,
    postNominalAdjectives: true,
    preNominalAdjectiveRoles: ["property_quality"],
    apocope: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  th: {
    features: { adjectivePosition: "post" }, postNominalAdjectives: true, spacelessJoin: true, spacelessTiles: true },
  tr: {
    features: {
      adjectivePosition: "pre", zeroPresentCopula: true,
      marksCaseOnDirectObjects: true,
      // Possession is existential («Benim işim var») and the possessed noun
      // carries a person-agreeing suffix; predicate nominals take personal
      // copular endings («Ben adamım», «Sen kızsın») with -DIr only in 3sg.
      possessiveSuffixes: true, copulaPersonAgreement: true,
    },
    zeroPresentCopula: true, wordOrder: "SOV",
    inflectsNounPlural: true, verbPersonParadigm: true,
    latinEncodingChecks: true,
    possessiveSuffixes: true, copulaPersonSuffixes: true,
  },
  uk: {
    features: {
      adjectivePosition: "pre", zeroPresentCopula: true,
      marksCaseOnDirectObjects: true, marksCaseAfterPrepositions: true,
      declinesAttributiveAdjectives: true,
      // Numbers 5+ govern the genitive plural on noun AND adjective
      // («шість книг», «десять поганих паспортів»); 1 and 2 agree in
      // gender («одна робота», «дві сковороди») and 1 in case too
      // («Я маю одну роботу») — Emi 2026-08-28-07/-08.
      numeralGovernment: true, numeralGenderAgreement: true,
    },
    zeroPresentCopula: true,
    inflectsNounPlural: true, fullNounGender: true,
    verbPersonParadigm: true,
    numeralGenitivePlural: true, numeralGenderAgreement: true,
    caseMarking: {
      directObjectCase: "accusative",
      prepositions: {
        ON: "locative", IN: "locative", OFF: "locative",
        UNDER: "instrumental", BEHIND: "instrumental", FRONT: "instrumental",
        BETWEEN: "instrumental", NEXT_TO: "instrumental", BY: "instrumental",
        WITH: "instrumental",
        TO: "genitive", FROM: "genitive", FOR: "genitive",
      },
      femAccusativeStrategy: "uk",
      bareInstrumentalMeans: true,
    },
  },
};

export function langRule(lang, rule) {
  return !!LANGUAGE_RULES[lang]?.[rule];
}

// Raw value of a rule (for object/string-valued rules like caseMarking and
// wordOrder). undefined when undeclared.
export function langRuleValue(lang, rule) {
  return LANGUAGE_RULES[lang]?.[rule];
}

// Set of language codes declaring `rule` — lets the engine keep its
// existing Set-membership call sites while the declaration lives here.
export function langsWith(rule) {
  return new Set(
    Object.keys(LANGUAGE_RULES).filter((l) => LANGUAGE_RULES[l][rule]),
  );
}
