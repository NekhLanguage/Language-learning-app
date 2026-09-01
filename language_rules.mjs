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
//   classifiers              numerals and "a/an" count through a measure
//                            word before the noun (zh «一本书», «两条裤子»).
//                            { default, numeralOverrides } — per-noun
//                            `classifier` field in the data.
//   counters                 numeral + counter follow the counted noun
//                            (ko «책 한 권»). { default, numeralModifiers }
//                            — per-noun `counter` field in the data;
//                            numeralModifiers maps citation numerals to
//                            their determiner forms (하나 → 한).
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
//   questionClitic           yes/no questions front the verb and fuse a
//                            clitic onto it, chosen by vowel harmony:
//                            {back, front} — fi «Onko tuo sinun
//                            puhelin?» («syökö», front-vowel verbs).
//   finalQuestionParticle    yes/no questions keep declarative order and
//                            append this particle at the end — zh «那是你
//                            的手机吗？», ja «それはあなたの電話ですか。»,
//                            th «นั่นคือโทรศัพท์ของคุณใช่ไหม». Emit any
//                            language-specific terminator (？) with the
//                            particle itself; finalizeSentence will add
//                            the CJK stop (。) when none is present.
//   conjugatingNegator       the negator is a verb and agrees with the
//                            subject in person/number through the NOT
//                            entry's own paradigm (fi en/et/ei/emme/
//                            ette/eivät) — an invariant negator keeps
//                            its array form.
//   negatedObjectCase        the nominal after the negator takes this
//                            case (fi partitive: «ei lounasta»),
//                            assigned through the same caseMap pass as
//                            prepositional case.
//   reflexivePossessiveSuffix
//                            when the clause subject owns the object
//                            (3rd person), the possessive is a suffix on
//                            the noun and the free pronoun disappears:
//                            fi «tyttärensä kanssa», never «hänen tytär»
//                            (that means someone ELSE's daughter).
//                            Data-driven via the noun's `possessed3` map
//                            keyed by case field ("form" for the
//                            nominative); missing data REFUSES a drilled
//                            3rd-person possessive rather than shipping
//                            the wrong meaning.
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
//   nominalParticles         topic/object particles on nominals. Values:
//                            topic/object/haveObject, each either a fixed
//                            string (ja は/を) or {afterConsonant,
//                            afterVowel} batchim-keyed allomorphs (ko
//                            은는/을를/이가); attach: true suffixes the
//                            particle onto the preceding word instead of
//                            inserting a standalone segment.
//   copulaSuffix             the present copula suffixes onto a NOMINAL
//                            predicate ({afterConsonant, afterVowel} —
//                            ko 이에요/예요), applied post-render to the
//                            sentence-final word. Adjective predicates
//                            use their data `predicative` form instead.
//                            excludeStructures lists template structures
//                            whose predicate can't take the suffix.
//   authoredVerbSurfaces     a per-template surface override for a MAIN verb
//                            (tpl.surface[lang][cid]) is the correct finite
//                            form and wins over the paradigm/base lookup —
//                            ja «帰ります» in "I go home", «やめます» in
//                            "we stop eating". Complement verbs after a
//                            control verb already read the override.
//   postposedAdpositions     adpositions follow their noun phrase (ja
//                            «家から行きます», «テーブルに行きます») — the
//                            SOV ordering emits noun before glue.
//   existentialHaveByNoun    HAVE splits by the possessed noun: nouns whose
//                            entry carries `existentialHave: true` take the
//                            existential construction (ja «会議があります» —
//                            noun + haveObject particle + the HAVE entry's
//                            `existential` form); other nouns keep the
//                            transitive verb («シャツを持っています»).
//   verbCoordination         "te": V1-AND-V2 renders V1 in its `te` data
//                            form, drops the conjunction word, and leaves V2
//                            finite — ja «食べて飲みます», never «食べる
//                            そして飲む» (Emi run-10 -47). Missing te data
//                            falls through to the generic path (ratcheted).
//   contrastiveNegation      the "V O1 but not O2" template shape.
//                            { repeatVerb: true } repeats the finite verb
//                            after the negator (zh «他吃早餐，但是不吃
//                            午餐» — Emi run-9 -37); { conjunction,
//                            negatedVerbForm: true } closes the first clause
//                            with the conjunction and renders O2 + topic
//                            particle + the verb entry's `negative` form
//                            (ja «…食べますが、昼ご飯は食べません» — Emi
//                            run-10 -50). Missing data falls through.
//   possessiveSuffix         possessives are pronominal suffixes on the
//                            possessed noun, declared as a map keyed by
//                            possessive concept id (ar ي/ك/ه/ها/نا/هم:
//                            «يدي», «غرفتها») — the free word the data
//                            stores («لي») is the dative and means "to
//                            me", not "my" (Emi run-6 -16). Ta marbuta
//                            opens before the suffix (غرفة → غرفتها).
//   demonstrativeGenderAgreement
//                            a demonstrative subject agrees with its
//                            predicate noun's gender via the entry's `f`
//                            form («هذه يدي», «تلك ساقك») — the
//                            masculine dictionary form beside a feminine
//                            predicate contradicts the adjective
//                            agreement already rendered (Emi run-11 -52).
//   verbGovernedPrepositions the verb's own government decides the
//                            preposition before its complement, via the
//                            verb entry's `governedPreposition` field
//                            («أحصل على كتاب», «تتوقف عن الأكل», «أذهب
//                            إلى المنزل») — never the English source,
//                            which marks none of these (Emi run-11 -53).
//                            Skipped when the template carries an
//                            explicit glue word for the relation.
//   counterPrefix            numerals count through a per-noun counter
//                            prefixed to the noun with a linker (ja
//                            «二冊の本», «十七台の電話»). { kunCounter,
//                            default, linker } — kunCounter (つ) covers
//                            ONE-NINE when the noun declares no counter;
//                            a per-noun `counter` field wins at any number
//                            (Emi run-10: 個 was the only counter emitted).
//   locativeCopula           string surface for the copula BE when its
//                            complement is a position glue (spatial_relation)
//                            or a `place`-semantic noun ("he is home") —
//                            zh «在» distinct from the identity 是, same
//                            way Thai splits three ways via thCopulaOverride
//                            (Emi run-9 -39).
//   colorPredicateSuffix     string appended to the bare color root in
//                            predicate position — zh «色的» making «这本书
//                            是红色的», not «书很红» (Emi run-9/run-6 -20).
//                            Attributive position is untouched.
//   comitativeBeforeVerb     string linker inserted between a comitative
//                            WITH-phrase and the verb when the phrase moves
//                            before the verb (zh «一起»: 他和他的妈妈一起
//                            吃晚餐 — Emi run-9 -40).
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
//   negatorAgreement           the negation word agrees with the subject
//                              (fi «emme» — implemented by
//                              conjugatingNegator + the NOT paradigm)
//   zeroPresentCopula          present-tense "to be" is dropped/suffixed
//   definitenessAgreement      adjectives agree in definiteness (ar)
//   locativeCopula             a distinct copula surface is used before a
//                              location (zh 在 vs 是; th อยู่ vs เป็น)
//   predicateColorNominalizer  colour adjectives in predicate position are
//                              nominalized (zh «红色的» not stative «很红»)
//   comitativeBeforeVerb       the comitative WITH-phrase precedes the verb
//                              (zh 他和他的妈妈一起吃晚餐)
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
//   verbGenderParadigm       3sg (at minimum) also agrees in gender — the
//                            engine prefers `${p}_${n}_feminine` /
//                            `${p}_${n}_masculine` when the subject carries
//                            gender, and only falls back to the plain key.
//                            Arabic today: «هي ترى» not «هي يرى» (Emi
//                            2026-08-28-15)
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
//   inanimateSubjectProDrop  the neuter "it" subject of an ordinary verb is
//                            dropped in generation («Mży.») while personal
//                            pronouns stay explicit (pl today; the grader's
//                            proDrop flag is unrelated and grading-only)
//   possessiveEnclitic       the possessor follows the possessed noun
//                            (th มือของฉัน; el «το βιβλίο μου» — with the
//                            definite article when the language also
//                            declares possessiveDefiniteArticle)
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
      verbGenderParadigm: true, postposedNumerals: true,
    },
    postNominalAdjectives: true, zeroPresentCopula: true,
    inflectsNounPlural: true, fullNounGender: true,
    nounGenderForCountables: true, verbPersonParadigm: true,
    verbGenderParadigm: true,
    // Yes/no questions front هل over the declarative clause («هل ذلك لك
    // هاتف؟») — Emi run-11 -54: the fourth language on the shared
    // question bug (fi -ko / zh 吗 / ja か / ar هل). Wh-questions were
    // already localized; yes/no never was. finalize swaps in Arabic ؟/،.
    questionParticle: "هل",
    // Possessives suffix onto the possessed noun («يدي», «رأسك»,
    // «غرفتها») — Emi run-6 -16, run-11 blast radius 12% of sentences.
    possessiveSuffix: {
      MY: "ي", YOUR: "ك", HIS: "ه", HER: "ها", OUR: "نا", THEIR: "هم",
    },
    demonstrativeGenderAgreement: true,
    verbGovernedPrepositions: true,
    // 1 and 2 postpose as appositive adjectives («كتاب واحد», never
    // «واحد كتاب» — Emi 2026-08-28-17); 3-10 prepose with reverse-gender
    // polarity governing the genitive plural, an unimplemented mechanism
    // that stays in the divergence baseline until numeral data carries
    // gender + a genitive-plural noun field exists. Only allowlisted CIDs
    // postpose so the un-shipped forms keep the pre-nominal placeholder
    // Emi's report already knows to expect. Modern Standard Arabic also
    // omits the numeral for 1 in most contexts («لدي كتاب» is idiomatic
    // for "I have a/one book"), but the app teaches the explicit numeral,
    // so we render it in the appositive slot rather than dropping it.
    postposedNumerals: ["ONE"],
  },
  en: {
    features: {
      indefiniteArticle: true, adjectivePosition: "pre",
    },
    indefiniteArticle: true,
    inflectsNounPlural: true, latinEncodingChecks: true,
  },
  fi: {
    features: {
      adjectivePosition: "pre",
      // Objects change form — fi's `accusative` data field carries the
      // ACTUAL object-case surface the corpus uses per noun (partitive
      // «vettä»/«ruokaa» for atelic objects, genitive-accusative
      // «puhelimen» for telic ones); the literal "accusative" routes the
      // engine's object machinery, the data decides the ending.
      marksCaseOnDirectObjects: true,
      // Locative relations are case endings, not preposition words
      // («pöydällä» = on the table) — and the spatial postpositions
      // govern the genitive («pöydän alla»).
      marksCaseAfterPrepositions: true,
      // Every number ≥2 governs the partitive singular («kaksi kirjaa»).
      numeralGovernment: true,
      // Attributive adjectives agree with their head noun in case and
      // number («uutta kirjaa», «uuden puhelimen» — Emi run-7 -28:
      // 0 inflected adjectives in 292 swept sentences).
      declinesAttributiveAdjectives: true,
      // The negation word is a conjugating verb (en/et/ei/emme/ette/
      // eivät — Emi run-7 -31: «Me … mutta ei» needs «emme»).
      negatorAgreement: true,
      // 3rd-person reflexive possession REQUIRES the -nsA suffix —
      // «hänen tytär» means someone else's daughter (Emi run-7 grading:
      // a meaning change, not a register call).
      possessiveSuffixes: true,
    },
    verbPersonParadigm: true, inflectsNounPlural: true,
    latinEncodingChecks: true,
    numeralPartitiveSingular: true,
    // Possession is existential: possessor in the adessive + invariant
    // «on» + possessed in the nominative («Minulla on kirja»). The HAVE
    // entry pins «on» via the uniform-present path.
    existentialPossession: "adessive",
    conjugatingNegator: true,
    negatedObjectCase: "partitive",
    reflexivePossessiveSuffix: true,
    questionClitic: { back: "ko", front: "kö" },
    caseMarking: {
      directObjectCase: "accusative",
      // An attributive adjective mirrors the case field its head noun
      // rendered («uutta kirjaa» partitive, «uuden puhelimen» genitive-
      // accusative) — data-driven via the adjective's own case fields;
      // an adjective missing them is refused as a modifier, never
      // shipped nominative.
      adjectiveAgreesWithCase: true,
      prepositions: {
        ON: { case: "adessive", suppressWord: true },
        IN: { case: "inessive", suppressWord: true },
        FROM: { case: "elative", suppressWord: true },
        TO: { case: "illative", suppressWord: true },
        BY: { case: "adessive", suppressWord: true },
        UNDER: { case: "genitive", postposed: true },
        BEHIND: { case: "genitive", postposed: true },
        FRONT: { case: "genitive", postposed: true },
        NEXT_TO: { case: "genitive", postposed: true },
        BETWEEN: { case: "genitive", postposed: true },
        // «kanssa» is a genitive postposition like the spatial ones
        // («tyttärensä kanssa») — Emi run-7 -30.
        WITH: { case: "genitive", postposed: true },
      },
    },
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
      // Possessives are enclitic: the noun keeps its definite article and
      // the possessive follows — «το βιβλίο μου», never «μου βιβλίο»
      // (Emi 2026-08-28-01: 16/16 observed possessives were wrong).
      possessivePlacement: "enclitic",
    },
    indefiniteArticle: true,
    inflectsNounPlural: true, fullNounGender: true,
    verbPersonParadigm: true,
    numeralGenderAgreement: true,
    possessiveEnclitic: true, possessiveDefiniteArticle: true,
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
    features: {
      adjectivePosition: "pre",
      // は topics the subject, を marks the direct object — the same
      // declared rule ko uses (the insertion logic previously lived as a
      // ja-only branch in renderSegments).
      topicParticle: true, marksCaseOnDirectObjects: true,
      // Numerals count through a per-noun counter («二冊の本», «十七台の
      // 電話») — 個 is generic, not universal (Emi run-10: every counter
      // in 380 sentences was 個).
      classifiersOrCounters: true,
      // Adpositions follow their noun phrase: «家から», «テーブルに» —
      // the postposedAdpositions rule is what drives the SOV noun-before-
      // glue emission and the spatial_relation reorder.
      postposedAdpositions: true,
    },
    spacelessTiles: true, wordOrder: "SOV",
    nominalParticles: {
      topic: "は", object: "を",
      // Flagged abstract nouns possess existentially: «会議が» + あります
      // (Emi run-10 -48: 持つ was a universal "have", 86 instances).
      haveObject: "が",
      // Bare destinations of a motion verb take に, never を: «家に
      // 帰ります», not «家を行く» (Emi run-10 -49).
      destination: "に",
    },
    // Yes/no questions keep declarative order and append か at the end:
    // «それはあなたの電話ですか。» — never «ですそれあなたの電話？»
    // (Emi run-10 -51). か itself carries the question sense; finalize
    // adds the sentence-final 。.
    statementOrderQuestion: true,
    finalQuestionParticle: "か",
    // The authored per-template verb surface is the correct finite form
    // («帰ります», «やめます») — read it for main verbs, not only
    // control-verb complements.
    authoredVerbSurfaces: true,
    // Postpositions follow their noun: «家から行きます», «テーブルに
    // 行きます» — never «から家» (the SOV ordering emits noun first).
    postposedAdpositions: true,
    existentialHaveByNoun: true,
    verbCoordination: "te",
    contrastiveNegation: { conjunction: "が、", negatedVerbForm: true },
    counterPrefix: { kunCounter: "つ", default: "個", linker: "の" },
  },
  ko: {
    features: {
      adjectivePosition: "pre",
      // The present copula is never a standalone word — it suffixes onto
      // the nominal predicate as 이에요/예요 («남자예요», «손이에요»).
      zeroPresentCopula: true,
      // 을/를 marks the direct object (이/가 in the existential
      // have-construction: «셔츠가 있어요»), 은/는 topics the subject —
      // Emi 2026-08-28-13: zero particles in 140 sentences.
      topicParticle: true, marksCaseOnDirectObjects: true,
      // Numerals count through a counter that follows the noun:
      // «책 한 권을 읽어요» — never «넷 나쁜 책» (Emi 2026-08-28-14).
      classifiersOrCounters: true,
    },
    wordOrder: "SOV",
    zeroPresentCopula: true,
    // Yes/no questions keep declarative order and ask with intonation:
    // «그것은 당신의 전화예요?» — never a fronted copula.
    statementOrderQuestion: true,
    // Particle allomorphy keys on the final syllable's batchim: 은/이/을
    // after a consonant-final syllable, 는/가/를 after a vowel-final one.
    // attach: true suffixes the particle onto the preceding word («나» →
    // «나는») instead of inserting a standalone segment (ja).
    nominalParticles: {
      topic: { afterConsonant: "은", afterVowel: "는" },
      object: { afterConsonant: "을", afterVowel: "를" },
      haveObject: { afterConsonant: "이", afterVowel: "가" },
      attach: true,
    },
    // The suffixal present copula on nominal predicates: «소년이에요»,
    // «여자예요». Adjective predicates carry their own predicative verb
    // form from the data instead («책은 빨개요»). Locative and clause-
    // internal copulas can't take the suffix — excluded, ratcheted.
    copulaSuffix: {
      afterConsonant: "이에요", afterVowel: "예요",
      excludeStructures: [
        "spatial_relation", "spatial_relation_complex", "complex_clause",
      ],
    },
    // Numeral + counter FOLLOW the counted noun («책 한 권», «나쁜 책 네
    // 권»); the attach-mode object particle then lands on the counter
    // («책 한 권을»). Per-noun `counter` field in the data; 개 is the
    // universal default. Native numerals take their determiner form
    // before a counter — the replacements apply to the numeral's final
    // syllable(s), so compounds inflect too (열넷 → 열네).
    counters: {
      default: "개",
      numeralModifiers: { "하나": "한", "둘": "두", "셋": "세", "넷": "네" },
    },
  },
  zh: {
    features: {
      adjectivePosition: "pre",
      // Countable nouns are counted (and take English "a/an") through a
      // measure word: «一本书», «两条裤子» — never bare «六工作»
      // (Emi 2026-08-28-19 / run-9).
      classifiersOrCounters: true,
      // Location predicates ("book is on table", "he is home") take the
      // locative copula 在, not the identity copula 是 — Emi run-9 -39.
      locativeCopula: true,
      // Position words follow their reference noun («桌子上面», not «上面
      // 桌子») — Emi run-9 -39, same shape as ja's postposedAdpositions.
      postposedAdpositions: true,
      // Predicate colour adjectives take the 是 X色的 declarative shape
      // («这本书是红色的»), not the stative-verb 很 X pattern — Emi run-9
      // /run-6 -20.
      predicateColorNominalizer: true,
      // "SUBJ + VERB + with X" restructures as "SUBJ + with X + 一起 +
      // VERB" in Chinese; the comitative phrase precedes the verb and a
      // 一起 linker joins the two — Emi run-9 -40.
      comitativeBeforeVerb: true,
    },
    spacelessTiles: true,
    // Per-noun `classifier` field in the data; 个 is the universal default
    // (never wrong, only sometimes less idiomatic). Before a classifier
    // the counting numeral 两 replaces 二 (Emi 2026-08-29-41).
    classifiers: { default: "个", numeralOverrides: { TWO: "两" } },
    // Yes/no questions keep declarative order and end with 吗？ — never a
    // fronted copula («是那你的电话？» from Emi run-9/-38 was the bug).
    // The full-width ？ ships with the particle; finalize collapses
    // spaces around CJK glyphs.
    statementOrderQuestion: true,
    finalQuestionParticle: "吗？",
    // "V O1 but not O2" repeats the verb after the negator — 不 cannot
    // negate a bare noun: «他吃早餐，但是不吃午餐», never «…但是不午餐»
    // (Emi run-9 -37). The negator is the NOT entry's own form.
    contrastiveNegation: { repeatVerb: true },
    // -39: locative copula 在 replaces 是 when the predicate is a position
    // glue (spatial_relation templates) or a `place` noun ("he is home" →
    // 他在家). Fires from copulaOverride and also drives the
    // spatial_relation reorder / position-word stripping.
    locativeCopula: "在",
    // -39: spatial_relation position words follow their ground noun ([BOOK,
    // BE, ON, TABLE] renders as 书在桌子上面, not 书是在上面桌子). The
    // reorder runs whenever the language declares postposedAdpositions.
    postposedAdpositions: true,
    // -20: colour adjectives in predicate position render as `<root>色的`
    // ("red" → 红色的) after the 是 copula. The bare color stem stays
    // correct in attributive position.
    colorPredicateSuffix: "色的",
    // -40: comitative WITH-phrase moves before the verb with a 一起 linker
    // between phrase and verb. Applies to both object-carrying and
    // objectless complex-clause main clauses.
    comitativeBeforeVerb: "一起",
  },
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
    // The neuter "it" subject of an ordinary verb is dropped in GENERATION
    // («Mży.», never «Ono mży.» / «To myje…») — a Nekh-approved carve-out
    // from the explicit-pronoun pedagogy, which personal pronouns keep.
    inanimateSubjectProDrop: true,
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
    features: { adjectivePosition: "post", possessivePlacement: "enclitic" },
    postNominalAdjectives: true, spacelessJoin: true, spacelessTiles: true,
    possessiveEnclitic: true,
    // Yes/no questions keep declarative order and end with the tag particle
    // ใช่ไหม — no terminal punctuation (Thai's finalize strips . and ?).
    statementOrderQuestion: true,
    finalQuestionParticle: "ใช่ไหม",
  },
  tr: {
    features: {
      adjectivePosition: "pre", zeroPresentCopula: true,
      marksCaseOnDirectObjects: true,
      // The indefinite article `bir` is invariant («bir kitap», «bir ev»,
      // «bir adam») — no gender agreement, no allomorphy. Appears before
      // singular countable nouns in indefinite contexts; predicate
      // nominals and direct objects both take it. Emi 2026-08-29: 51/128
      // of the tr divergence baseline was `bir` missing.
      indefiniteArticle: true,
      // Possession is existential («Benim işim var») and the possessed noun
      // carries a person-agreeing suffix; predicate nominals take personal
      // copular endings («Ben adamım», «Sen kızsın») with -DIr only in 3sg.
      possessiveSuffixes: true, copulaPersonAgreement: true,
    },
    zeroPresentCopula: true, wordOrder: "SOV",
    // `bir` is a fully separable free word (never fuses with the noun) AND
    // Turkish frequently omits it in generic/definite contexts — the article
    // is loose enough that authored surfaces which represent a bir-less
    // rendering are the truth of the context, not a bug to guard against.
    // The surface-override guards (sentence_engine ARTICLE_LANGS branches)
    // gate on this: strict-article languages (de/en/es/fr/it/no/pt/el)
    // reject a lexeme swap that would silently drop the article; tr does
    // not, because dropping bir in a context that never needed it is not
    // a bug (Ben eve giderim, Ben yemek yerim — both authored bir-less).
    looseIndefiniteArticle: true,
    indefiniteArticle: true,
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
