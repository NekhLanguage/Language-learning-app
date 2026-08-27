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
//   virilePlural             plural agreement splits virile/non-virile:
//                            nouns flag `virile: true`, adjectives carry a
//                            `vp` (virile plural) form («nowi» vs «nowe»).
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

export const LANGUAGE_RULES = {
  ar: {
    postNominalAdjectives: true, zeroPresentCopula: true,
    inflectsNounPlural: true, fullNounGender: true,
    nounGenderForCountables: true, verbPersonParadigm: true,
  },
  en: {
    indefiniteArticle: true,
    inflectsNounPlural: true, latinEncodingChecks: true,
  },
  fr: {
    indefiniteArticle: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  de: {
    indefiniteArticle: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true, latinEncodingChecks: true,
  },
  el: {
    indefiniteArticle: true,
    inflectsNounPlural: true, fullNounGender: true,
    verbPersonParadigm: true,
  },
  it: {
    indefiniteArticle: true,
    postNominalAdjectives: true,
    possessiveDefiniteArticle: true,
    proDrop: true,
    flexibleAdjectiveOrder: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  ja: { spacelessTiles: true, wordOrder: "SOV" },
  ko: { wordOrder: "SOV" },
  zh: { spacelessTiles: true },
  no: {
    indefiniteArticle: true,
    inflectsNounPlural: true, latinEncodingChecks: true,
  },
  pt: {
    indefiniteArticle: true, postNominalAdjectives: true, proDrop: true,
    secondPersonAsThird: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true, latinEncodingChecks: true,
  },
  es: {
    indefiniteArticle: true, proDrop: true,
    inflectsNounPlural: true, nounGenderForCountables: true,
    verbPersonParadigm: true,
  },
  th: { postNominalAdjectives: true, spacelessJoin: true, spacelessTiles: true },
  tr: {
    zeroPresentCopula: true, wordOrder: "SOV",
    inflectsNounPlural: true, verbPersonParadigm: true,
    latinEncodingChecks: true,
  },
  uk: {
    zeroPresentCopula: true,
    inflectsNounPlural: true, fullNounGender: true,
    verbPersonParadigm: true,
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
