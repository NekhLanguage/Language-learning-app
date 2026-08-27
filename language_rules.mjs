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

export const LANGUAGE_RULES = {
  ar: { postNominalAdjectives: true, zeroPresentCopula: true },
  en: { indefiniteArticle: true },
  fr: { indefiniteArticle: true },
  de: { indefiniteArticle: true },
  el: { indefiniteArticle: true },
  it: {
    indefiniteArticle: true,
    postNominalAdjectives: true,
    possessiveDefiniteArticle: true,
    proDrop: true,
    flexibleAdjectiveOrder: true,
  },
  ja: { spacelessTiles: true },
  ko: {},
  zh: { spacelessTiles: true },
  no: { indefiniteArticle: true },
  pt: { indefiniteArticle: true, postNominalAdjectives: true, proDrop: true },
  es: { indefiniteArticle: true, proDrop: true },
  th: { postNominalAdjectives: true, spacelessJoin: true, spacelessTiles: true },
  tr: { zeroPresentCopula: true },
  uk: { zeroPresentCopula: true },
};

export function langRule(lang, rule) {
  return !!LANGUAGE_RULES[lang]?.[rule];
}

// Set of language codes declaring `rule` — lets the engine keep its
// existing Set-membership call sites while the declaration lives here.
export function langsWith(rule) {
  return new Set(
    Object.keys(LANGUAGE_RULES).filter((l) => LANGUAGE_RULES[l][rule]),
  );
}
