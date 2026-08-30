// Direct unit tests for the pure grammar engine. The baseline snapshot
// (validation/validate-sentences.mjs) guards against regressions across every
// template × language; these tests pin down the individual rules so a failure
// points at the exact rule that broke.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadVocab, loadLanguageCodes, loadTemplates } from "../../validation/load-vocab.mjs";
import {
  configureEngine,
  buildSentence,
  buildSentenceWithRules,
  getVerbForm,
  orderedConceptsForTemplate,
  frenchElision,
  englishIndefiniteArticle,
  pluralize,
  nounPhrase,
  surfaceForm,
  adjectiveSuitsNoun,
  isModifierCompatible,
  copularGenderClash,
  templateGenderClash,
  nounWithPossessive,
  blankSentence,
  ZERO_PRESENT_COPULA,
  PLURAL_EXCEPTIONS,
  sentenceTilesForTemplate,
  capitalizeFirst,
  safeSurfaceForConcept,
  finalizeSentence,
  isDirectObjectPosition,
  isCopularPredicatePosition,
} from "../../sentence_engine.mjs";

let templates;

before(() => {
  const vocab = loadVocab(loadLanguageCodes());
  templates = loadTemplates();
  // Deterministic config, mirroring validate-sentences.mjs: everything
  // released, rng high enough to suppress random modifier injection.
  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999,
  });
});

const tplById = (id) => templates.find((t) => t.template_id === id);

test("buildSentence matches the reference render (en, pt)", () => {
  const tpl = tplById("I_EAT_FOOD");
  assert.ok(tpl, "core template I_EAT_FOOD exists");
  assert.equal(buildSentence("en", tpl), tpl.render.en);
  assert.equal(buildSentence("pt", tpl), tpl.render.pt);
});

test("buildSentence is deterministic under a fixed rng", () => {
  const tpl = tplById("I_EAT_FOOD");
  for (const lc of ["en", "pt", "fr", "de", "ja", "tr"]) {
    assert.equal(buildSentence(lc, tpl), buildSentence(lc, tpl), lc);
  }
});

test("getVerbForm conjugates by the subject's person and number", () => {
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_SINGULAR", "pt"), "como");
  assert.equal(getVerbForm("EAT", "HE", "pt"), "come");
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_PLURAL", "pt"), "comemos");
  assert.equal(getVerbForm("EAT", "HE", "en"), "eats");
  assert.equal(getVerbForm("EAT", "FIRST_PERSON_SINGULAR", "en"), "eat");
});

test("Portuguese você takes third-person agreement", () => {
  assert.equal(getVerbForm("EAT", "SECOND_PERSON", "pt"), "come");
});

test("word order: SOV languages put the verb last", () => {
  const tpl = tplById("I_EAT_FOOD");
  assert.deepEqual(orderedConceptsForTemplate(tpl, "en"), [
    "FIRST_PERSON_SINGULAR", "EAT", "FOOD",
  ]);
  for (const sov of ["ja", "tr"]) {
    const ordered = orderedConceptsForTemplate(tpl, sov);
    assert.equal(ordered[ordered.length - 1], "EAT", `${sov} is verb-final`);
  }
});

test("French elision contracts vowel collisions", () => {
  assert.equal(frenchElision("je aime le eau"), "j'aime l'eau");
});

test("English indefinite article picks a/an", () => {
  assert.equal(englishIndefiniteArticle("apple"), "an");
  assert.equal(englishIndefiniteArticle("book"), "a");
});

test("pluralize handles regular and irregular nouns", () => {
  assert.equal(pluralize("box"), "boxes");
  assert.equal(pluralize("city"), "cities");
  assert.equal(pluralize("person"), "people");
  assert.equal(PLURAL_EXCEPTIONS["child"], "children");
});

test("pluralize -f/-fe class: knives, not knifes (Emi 2026-08-27-08)", () => {
  assert.equal(pluralize("knife"), "knives");
  assert.equal(pluralize("leaf"), "leaves");
  assert.equal(pluralize("shelf"), "shelves");
  assert.equal(pluralize("wife"), "wives");
  // The regular class and double-f words keep plain -s.
  assert.equal(pluralize("roof"), "roofs");
  assert.equal(pluralize("chief"), "chiefs");
  assert.equal(pluralize("belief"), "beliefs");
  assert.equal(pluralize("chef"), "chefs");
  assert.equal(pluralize("safe"), "safes");
  assert.equal(pluralize("cliff"), "cliffs");
  assert.equal(pluralize("giraffe"), "giraffes");
});

test("zero-copula languages are uk, ar, tr, ko", () => {
  // ko joined 2026-08-28: its present copula is the 이에요/예요 suffix on
  // the nominal predicate (language_rules copulaSuffix), never a word.
  assert.deepEqual([...ZERO_PRESENT_COPULA].sort(), ["ar", "ko", "tr", "uk"]);
});

test("surface forms resolve from vocab data", () => {
  assert.equal(surfaceForm("en", "HE"), "he");
  assert.equal(nounPhrase("en", "FOOD"), "food");
  assert.equal(nounPhrase("fr", "WATER"), "eau");
});

test("character-trait adjectives only pair with beings", () => {
  // User-reported: "You see a brave school" / "Ти бачиш хоробрий школа".
  // BRAVE/STRONG carry property_character and must reject inanimate nouns.
  assert.equal(adjectiveSuitsNoun("BRAVE", "SCHOOL"), false);
  assert.equal(adjectiveSuitsNoun("BRAVE", "POTION"), false);
  assert.equal(adjectiveSuitsNoun("STRONG", "SCHOOL"), false);
  assert.equal(adjectiveSuitsNoun("BRAVE", "FRIEND"), true);
  assert.equal(adjectiveSuitsNoun("BRAVE", "WIZARD"), true);
  assert.equal(adjectiveSuitsNoun("STRONG", "TROLL"), true);
});

test("blankSentence leaves the string unchanged when the surface is absent", () => {
  // The app treats an unchanged (blankless) result as "do not show this
  // exercise" — the L3 no-blank guard depends on this behavior.
  assert.equal(blankSentence("Ворог сильний тому що вона захищає друг.", "хоробрий"),
    "Ворог сильний тому що вона захищає друг.");
  assert.ok(blankSentence("Ти бачиш школу.", "школу").includes("_____"));
});

test("Ukrainian direct objects take the accusative", () => {
  // User-reported: the app rendered «Я п'ю вода» / «Він читає книга» —
  // dictionary (nominative) forms where Ukrainian marks the object with a
  // case ending instead of an article.
  assert.equal(buildSentence("uk", tplById("I_DRINK_WATER")), "Я п'ю воду.");
  assert.equal(buildSentence("uk", tplById("HE_READ_BOOK")), "Він читає книгу.");
  assert.equal(buildSentence("uk", tplById("I_EAT_FOOD")), "Я їм їжу.");
  assert.equal(buildSentence("uk", tplById("WE_HAVE_JOB")), "Ми маємо роботу.");
});

test("Ukrainian predicate and subject nouns stay nominative", () => {
  // Case applies to direct objects only — a predicate noun after the
  // (dropped) copula keeps the dictionary form.
  const pred = buildSentence("uk", tplById("THIS_IS_A_GOOD_BOOK"));
  assert.ok(pred.includes("книга"), `expected nominative «книга» in: ${pred}`);
  const en = buildSentence("en", tplById("I_DRINK_WATER"));
  assert.equal(en, "I drink water.", "en is untouched by uk case logic");
});

test("Ukrainian animate masculine objects use the explicit accusative data", () => {
  assert.equal(nounPhrase("uk", "WIZARD", { directObject: true }), "чарівника");
  assert.equal(nounPhrase("uk", "WIZARD"), "чарівник");
  // Inanimate masculine accusative equals the nominative.
  assert.equal(nounPhrase("uk", "PHONE", { directObject: true }), "телефон");
});

test("possessives agree with the possessed noun's gender", () => {
  // User-reported class: «Це мій рука» — the possessive rendered in its
  // base (masculine) form regardless of the noun it modifies.
  const uk = buildSentence("uk", tplById("THIS_IS_MY_HAND"));
  assert.ok(uk.includes("моя"), `expected feminine «моя» in: ${uk}`);
  const pt = buildSentence("pt", tplById("THIS_IS_MY_HAND"));
  assert.ok(pt.includes("minha"), `expected feminine «minha» in: ${pt}`);
});

test("Ukrainian prepositions govern the case of the following nominal", () => {
  // «на» + locative, «перед» + instrumental, «до» + genitive — data-driven
  // via locative/instrumental/genitive fields on the uk entries.
  assert.equal(buildSentence("uk", tplById("BOOK_ON_THIS")), "Книга на цьому.");
  assert.equal(buildSentence("uk", tplById("PHONE_IN_FRONT_OF_BOOK")), "Телефон перед книгою.");
  assert.equal(buildSentence("uk", tplById("I_GO_TO_HOUSE")), "Я йду до будинку.");
  // Bare instrumental expresses means — the BY word disappears into the ending.
  assert.equal(buildSentence("uk", tplById("I_DO_THIS_BY_HAND")), "Я роблю це рукою.");
});

test("fixed-form structures pass the authored render through", () => {
  // Questions need do-support/inversion, directions need derived adverbials —
  // grammar the generator cannot synthesize, so the authored string wins.
  assert.equal(buildSentence("en", tplById("WHY_DO_YOU_GO")), "Why do you go?");
  assert.equal(buildSentence("uk", tplById("WHY_DO_YOU_GO")), "Чому ти йдеш?");
  assert.equal(buildSentence("uk", tplById("WE_GO_NORTH")), "Ми йдемо на північ.");
});

test("described noun subjects take the definite article", () => {
  assert.equal(buildSentence("en", tplById("BOOK_IS_RED")), "The book is red.");
  assert.equal(buildSentence("pt", tplById("BOOK_IS_RED")), "O livro é vermelho.");
  assert.equal(buildSentence("no", tplById("BOOK_IS_RED")), "Boken er rød.");
  // Predicate nouns after a personal pronoun stay indefinite.
  assert.equal(buildSentence("en", tplById("SHE_IS_WOMAN")), "She is a woman.");
});

test("Turkish 3rd-person copular sentences carry the -DIR suffix", () => {
  // Formal-Turkish predicative copula: a 3rd-person copular sentence attaches
  // a suffix to the last word of the predicate. Variant chosen by vowel
  // harmony + consonant assimilation. Present-tense "to be" still drops as a
  // separate word (Turkish stays in ZERO_PRESENT_COPULA).
  // Adjective predicate, vowel-final stem, back-unrounded harmony → -dır:
  assert.equal(buildSentence("tr", tplById("BOOK_IS_RED")), "Kitap kırmızıdır.");
  // Back-rounded harmony after -un:
  assert.equal(buildSentence("tr", tplById("BOOK_IS_LONG")), "Kitap uzundur.");
  // Voiceless-final consonant assimilation → -tur:
  assert.equal(buildSentence("tr", tplById("WINTER_IS_COLD")), "Kış soğuktur.");
  // Front-unrounded harmony, vowel-final:
  assert.equal(buildSentence("tr", tplById("MORNING_IS_GOOD")), "Sabah iyidir.");
  // Possessed-noun predicate (structure=undefined):
  assert.equal(buildSentence("tr", tplById("THIS_IS_MY_HAND")), "Bu benim elimdir.");
  // Possessive-pronoun predicate (structure=possessive):
  assert.equal(buildSentence("tr", tplById("THIS_IS_MINE")), "Bu benimdir.");
  // Plural possessive pronoun (last vowel of "onların" is ı):
  assert.equal(buildSentence("tr", tplById("THIS_IS_THEIRS")), "Bu onlarındır.");
  // Spatial-relation templates keep no suffix ("Kitap bunun üstünde."), so
  // engine output stays baseline-diverged (no fake -dır on a locative).
  assert.equal(buildSentence("tr", tplById("BOOK_ON_THIS")).endsWith("dir.") ||
               buildSentence("tr", tplById("BOOK_ON_THIS")).endsWith("dır."), false);
});

test("copular structure is inferred for franchise-pack [noun, BE, adj] templates", () => {
  // The pack templates ship without an explicit `structure: {type: "copular"}`
  // field, but their [nonPronounNoun, BE, adjective] shape is copular
  // whenever the authored EN render leads with a definite article. Without
  // inference the definite-article gate drops through and generates "A
  // striker is aggressive" — a regression against the ~50 baselined EN
  // divergences the 2026-07-18 fix pruned.
  assert.equal(buildSentence("en", tplById("PLAYER_IS_AGGRESSIVE")), "The striker is aggressive.");
  assert.equal(buildSentence("en", tplById("GUITAR_IS_LOUD")), "The guitar is loud.");
  // Fitness templates authored "A muscle is sore" (generic reading) stay
  // indefinite — the authored render is the author's declaration of intent.
  assert.equal(buildSentence("en", tplById("MUSCLE_IS_SORE")), "A muscle is sore.");
});

test("plural-only subjects get plural copula and adjective agreement", () => {
  assert.equal(buildSentence("en", tplById("PANTS_ARE_BLACK")), "The pants are black.");
  assert.equal(buildSentence("uk", tplById("PANTS_ARE_BLACK")), "Штани чорні.");
  assert.equal(buildSentence("pt", tplById("PANTS_ARE_BLACK")), "As calças são pretas.");
});

test("CJK sentences join without spaces and end with a full-width stop", () => {
  assert.equal(buildSentence("zh", tplById("I_EAT_FOOD")), "我吃食物。");
  assert.equal(buildSentence("ja", tplById("I_EAT_FOOD")), "私は食べ物を食べます。");
});

test("Japanese noun-subject copular sentences take the topic marker は", () => {
  // Non-pronoun subject in an X_IS_ADJ sentence: the engine previously left
  // the subject unmarked ("本赤いです"), missing the topic particle every
  // authored render carries. Both structure.type "copular" (BOOK_IS_RED)
  // and structure.type "time_description" (AUTUMN_IS_OLD) are covered.
  assert.equal(buildSentence("ja", tplById("BOOK_IS_RED")), "本は赤いです。");
  assert.equal(buildSentence("ja", tplById("PANTS_ARE_BLACK")), "ズボンは黒いです。");
  assert.equal(buildSentence("ja", tplById("AUTUMN_IS_OLD")), "秋は古いです。");
  assert.equal(buildSentence("ja", tplById("NIGHT_IS_DARK")), "夜は暗いです。");
  // Pronoun subjects still get は via the existing pronoun-based path —
  // the new branch only fires when no pronoun is present.
  assert.equal(buildSentence("ja", tplById("I_AM_MAN")), "私は男です。");
});

test("attributive modifiers agree with the noun and absorb its article", () => {
  // «іншу книгу» — feminine accusative agreement; "another book" — no
  // double article.
  assert.equal(buildSentence("uk", tplById("I_HAVE_ANOTHER_BOOK")), "Я маю іншу книгу.");
  assert.equal(buildSentence("en", tplById("I_HAVE_ANOTHER_BOOK")), "I have another book.");
});

test("Ukrainian conjunctions take a comma; time-word subjects agree", () => {
  assert.equal(buildSentence("uk", tplById("HE_EAT_BREAKFAST_BUT_NOT_LUNCH")),
    "Він їсть сніданок, але не обід.");
  assert.equal(buildSentence("uk", tplById("NIGHT_IS_DARK")), "Ніч темна.");
});

test("per-language noArticle data suppresses the indefinite article", () => {
  assert.equal(buildSentence("en", tplById("I_EAT_BREAKFAST")), "I eat breakfast.");
  assert.equal(buildSentence("en", tplById("I_GO_HOME")), "I go home.");
  assert.equal(buildSentence("pt", tplById("SHE_HAS_SHOES")), "Ela tem sapatos.");
});

test("Italian articles: allomorphy, definiteness, partitive, contraction", () => {
  assert.equal(buildSentence("it", tplById("HE_READ_BOOK")), "Lui legge un libro.");
  assert.equal(buildSentence("it", tplById("BOOK_IS_RED")), "Il libro è rosso.");
  assert.equal(buildSentence("it", tplById("YEAR_IS_LONG")), "L'anno è lungo.");
  assert.equal(buildSentence("it", tplById("PANTS_ARE_BLACK")), "I pantaloni sono neri.");
  assert.equal(buildSentence("it", tplById("SHE_HAS_SHOES")), "Lei ha delle scarpe.");
  assert.equal(buildSentence("it", tplById("BOOK_NEXT_TO_PHONE")),
    "Il libro è accanto al telefono.");
});

test("Italian possessives take the definite article", () => {
  assert.equal(buildSentence("it", tplById("THIS_IS_MY_HAND")), "Questa è la mia mano.");
  assert.equal(buildSentence("it", tplById("IS_THAT_YOUR_PHONE")), "È quello il tuo telefono?");
});

test("trailing subordinate clauses put the main clause first", () => {
  // Cross-language fix surfaced by the Italian systems test: the BECAUSE
  // clause used to lead ("He is home because he eats dinner...").
  const en = buildSentence("en", tplById("HE_EATS_DINNER_WITH_HIS_MOM_BECAUSE_HE_IS_HOME"));
  assert.ok(en.startsWith("He eats dinner"), en);
  assert.ok(en.includes("because he is home"), en);
});

test("Thai: spaceless script, no terminal punctuation", () => {
  assert.equal(buildSentence("th", tplById("I_EAT_FOOD")), "ฉันกินอาหาร");
  assert.equal(buildSentence("th", tplById("HE_READ_BOOK")), "เขาอ่านหนังสือ");
});

test("Thai copula splits three ways", () => {
  // Zero before a stative adjective, อยู่ for location, เป็น for noun
  // predicates, คือ after a demonstrative subject.
  assert.equal(buildSentence("th", tplById("BOOK_IS_RED")), "หนังสือสีแดง");
  assert.equal(buildSentence("th", tplById("BOOK_ON_THIS")), "หนังสืออยู่บนนี้");
  assert.equal(buildSentence("th", tplById("I_AM_MAN")), "ฉันเป็นผู้ชาย");
  assert.equal(buildSentence("th", tplById("THIS_IS_MY_HAND")), "นี่คือมือของฉัน");
});

test("Thai possessors follow the noun; yes-no asks with ใช่ไหม", () => {
  assert.equal(buildSentence("th", tplById("SHE_IS_MY_MOM")), "เธอเป็นแม่ของฉัน");
  assert.equal(buildSentence("th", tplById("IS_THAT_YOUR_PHONE")),
    "นั่นคือโทรศัพท์ของคุณใช่ไหม");
});

test("Thai counts with a classifier after the number", () => {
  assert.equal(buildSentence("th", tplById("I_HAVE_ANOTHER_BOOK")), "ฉันมีหนังสืออีกเล่ม");
});

test("countable:false beats gender data — mass nouns never take numbers", () => {
  // Adding gender to WATER (for article/agreement work) used to re-open it
  // to number injection: «tre acqua buone».
  assert.equal(isModifierCompatible("it", "TWO", "WATER"), false);
  assert.equal(isModifierCompatible("uk", "TWO", "WATER"), false);
  assert.equal(isModifierCompatible("it", "GOOD", "WATER"), false);
  // Meals reject person-adjectives: no «la colazione giovane».
  assert.equal(isModifierCompatible("it", "YOUNG", "BREAKFAST"), false);
});

test("Thai injected modifiers join spacelessly with the classifier", () => {
  // Forced injection is the live L3/L5 path the authored-render validators
  // never exercise: number takes a classifier, adjective attaches bare.
  assert.equal(buildSentence("th", tplById("HE_READ_BOOK"), "TWO"),
    "เขาอ่านหนังสือสองเล่ม");
  assert.equal(buildSentence("th", tplById("HE_READ_BOOK"), "GOOD"),
    "เขาอ่านหนังสือดี");
});

test("Italian pluralOnly nouns take plural possessive articles", () => {
  // «le mie scarpe», not «la mia scarpe».
  assert.equal(nounWithPossessive("it", "MY", "SHOES"), "le mie scarpe");
  assert.equal(nounWithPossessive("it", "MY", "PANTS"), "i miei pantaloni");
});

test("Italian nouns pluralize under injected numbers", () => {
  assert.equal(buildSentence("it", tplById("I_EAT_BREAKFAST"), "TWO"),
    "Io mangio due colazioni.");
});

test("null adj_/num_ sharedChoices suppress random modifier injection", () => {
  // Regression: L7 free production showed the authored prompt ("I use a
  // phone.") but graded against an engine sentence with a randomly injected
  // adjective («Я використовую червоний телефон») the prompt never mentioned.
  // L6/L7 suppress injection by pre-nulling the per-noun sharedChoices cache;
  // this pins that contract with an rng that would otherwise always inject.
  const vocab = loadVocab(loadLanguageCodes());
  const tpl = tplById("I_USE_PHONE");
  const inject = () => configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 4, completed: false }),
    rng: () => 0, // below every injection threshold — always inject
  });
  try {
    inject();
    const injected = buildSentence("uk", tpl);
    assert.notEqual(injected, tpl.render.uk,
      "premise: an unsuppressed build injects a modifier");
    for (const lc of ["uk", "en"]) {
      inject();
      assert.equal(
        buildSentence(lc, tpl, null, { adj_PHONE: null, num_PHONE: null }),
        tpl.render[lc],
        lc
      );
    }
  } finally {
    configureEngine({
      vocab: () => vocab,
      getReleased: () => Object.keys(vocab.concepts),
      ensureProgress: () => ({ level: 99, completed: false }),
      rng: () => 0.999,
    });
  }
});

test("Turkish HAVE templates render as genitive-possessor + var (not sahip ol-)", () => {
  const cases = [
    ["WE_HAVE_JOB",     "Bizim bir işimiz var."],
    ["I_HAVE_SHIRT",    "Benim bir gömleğim var."],
    ["SHE_HAS_SHOES",   "Onun ayakkabıları var."],
    ["THEY_HAVE_PANTS", "Onların pantolonları var."],
    ["WE_HAVE_CLOTHES", "Bizim kıyafetlerimiz var."],
  ];
  for (const [id, expected] of cases) {
    assert.equal(buildSentence("tr", tplById(id)), expected, id);
  }
});

test("Turkish non-HAVE templates keep nominative subject (no bleed of the genitive route)", () => {
  const stop = tplById("WE_STOP_EATING");
  assert.ok(stop, "WE_STOP_EATING exists");
  const s = buildSentence("tr", stop);
  assert.ok(s.startsWith("Biz "), `1pl non-HAVE stays nominative: ${s}`);
  assert.ok(!s.startsWith("Bizim"), `1pl non-HAVE must not use genitive: ${s}`);
});

test("HAVE templates in other languages still route through the standard clause path", () => {
  const t = tplById("WE_HAVE_JOB");
  assert.equal(buildSentence("en", t), t.render.en);
  assert.equal(buildSentence("pt", t), t.render.pt);
});

test("every core template renders a non-empty English sentence", () => {
  const core = templates.filter((t) => t._file === "sentence_templates.json");
  assert.ok(core.length > 100, "core template set is present");
  for (const tpl of core) {
    const s = buildSentence("en", tpl);
    assert.ok(s && s.trim().length > 0, `${tpl.template_id} rendered empty`);
  }
});

test("pronoun-less noun-subject templates conjugate against the noun", () => {
  // User-reported: «Мати покемона тип.» — the noun subject wasn't
  // recognized outside copular templates, so the verb fell back to the
  // infinitive and the subject was case-marked as a direct object.
  const tpl = tplById("POKEMON_HAVE_TYPE");
  assert.ok(tpl, "POKEMON_HAVE_TYPE exists");
  assert.deepEqual(orderedConceptsForTemplate(tpl, "en"), [
    "POKEMON", "HAVE", "TYPE",
  ]);
  assert.equal(getVerbForm("HAVE", "POKEMON", "uk"), "має");
  assert.equal(buildSentence("uk", tpl), "Покемон має тип.");
  assert.equal(buildSentence("en", tpl), tpl.render.en);
  const damage = tplById("MOVE_DO_DAMAGE");
  assert.equal(buildSentence("en", damage), damage.render.en);
  assert.equal(buildSentence("en", tplById("CLAN_HAS_MASTER")), "A clan has a master.");
});

test("uk nouns decline after case-governing prepositions", () => {
  // User-reported: «я йду з дім» tiles. до/з govern the genitive.
  assert.equal(buildSentence("uk", tplById("I_GO_FROM_HOME")), "Я йду з дому.");
  assert.equal(buildSentence("uk", tplById("I_GO_TO_GYM")), "Я йду до залу.");
  assert.equal(buildSentence("uk", tplById("I_GO_TO_LEAGUE")), "Я йду до ліги.");
  assert.equal(buildSentence("uk", tplById("HEAL_POKEMON_CENTER")), "Я йду до центру покемонів.");
  assert.equal(buildSentence("uk", tplById("I_GAIN_EXPERIENCE")), "Я отримую досвід.");
});

test("English demonstratives after positions render as this one / that one", () => {
  // User-reported: "The phone is off this." The OFF form is now "not on",
  // and a coordinated demonstrative pair stays parallel across the
  // connector ("between this one and that one").
  const phone = tplById("PHONE_OFF_THIS");
  assert.equal(buildSentence("en", phone), "The phone is not on this one.");
  assert.equal(buildSentence("en", phone), phone.render.en);
  assert.equal(buildSentence("uk", phone), "Телефон не на цьому.");
  const book = tplById("BOOK_BETWEEN_THIS_AND_THAT");
  assert.equal(buildSentence("en", book), "The book is between this one and that one.");
  assert.equal(buildSentence("en", book), book.render.en);
});

test("L6 word tiles join to the exact sentence buildSentence grades", () => {
  // The tiles must come from the same render path as the graded sentence —
  // a divergent tile («дім» vs «дому», a spurious «є» copula) forces the
  // learner to assemble a wrong answer.
  const cases = [
    ["I_GO_FROM_HOME", "uk"],
    ["PHONE_OFF_THIS", "uk"],
    ["PHONE_OFF_THIS", "en"],
    ["BOOK_BETWEEN_THIS_AND_THAT", "uk"],
    ["POKEMON_HAVE_TYPE", "uk"],
    ["I_GO_TO_GYM", "uk"],
    ["CLAN_HAS_MASTER", "en"],
  ];
  for (const [id, lc] of cases) {
    const tpl = tplById(id);
    assert.ok(tpl, `${id} exists`);
    const segments = sentenceTilesForTemplate(lc, tpl);
    assert.ok(segments && segments.length, `${id} ${lc} has tile segments`);
    const sentence = capitalizeFirst(segments.map((s) => s.text).join(" ")) + ".";
    assert.equal(sentence, buildSentence(lc, tpl), `${id} ${lc}`);
  }
});

test("feminine referent: predicate nouns use feminitives after 'she'", () => {
  // User-reported: «Вона професор.» — the predicate noun (and its article
  // in article languages) stayed masculine for a female referent.
  const tpl = tplById("SHE_IS_PROFESSOR");
  assert.equal(buildSentence("uk", tpl), "Вона професорка.");
  assert.equal(buildSentence("pt", tpl), "Ela é uma professora.");
  assert.equal(buildSentence("de", tpl), "Sie ist eine Professorin.");
  assert.equal(buildSentence("it", tplById("SHE_IS_TRAINER")), "Lei è un'allenatrice.");
  // The masculine twin is untouched.
  assert.equal(buildSentence("uk", tplById("HE_IS_TRAINER")), "Він тренер.");
  assert.equal(buildSentence("pt", tplById("HE_IS_TRAINER")), "Ele é um treinador.");
  // Nouns without a feminitive in the data keep the base form.
  assert.equal(buildSentence("uk", tplById("SHE_IS_GUIDE")), "Вона гід.");
});

test("feminine referent: predicate adjectives agree with 'she'", () => {
  assert.equal(buildSentence("uk", tplById("SHE_IS_MOTIVATED")), "Вона вмотивована.");
  assert.equal(buildSentence("pt", tplById("SHE_IS_MOTIVATED")), "Ela é motivada.");
  assert.equal(buildSentence("fr", tplById("SHE_IS_FRIENDLY")), "Elle est amicale.");
});

test("feminine referent: blanking surfaces use the feminitive", () => {
  // Without this the L3 blank substring-matches «професор» inside
  // «професорка» and shows «_____ка».
  const tpl = tplById("SHE_IS_PROFESSOR");
  const surface = safeSurfaceForConcept(tpl, "uk", "PROFESSOR");
  assert.equal(surface, "професорка");
  assert.ok(blankSentence(buildSentence("uk", tpl), surface).includes("_____"));
});

test("L6 tiles can rebuild the graded sentence for every template (uk, en)", () => {
  // Fixed-form templates (questions, directions, evaluations, complex
  // clauses) used to hand out per-concept tiles that could not rebuild the
  // sentence — phantom «є» copula, raw «бути», missing «на північ». Tiles
  // now tokenize the graded sentence itself, so joining them (modulo
  // finalization, punctuation, and case) must reproduce it exactly.
  const strip = (s) => s
    .replace(/^[¿¡]+\s*/, "")
    .replace(/[.?!;。？！]+\s*$/, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  for (const lc of ["uk", "en"]) {
    for (const tpl of templates) {
      const tiles = sentenceTilesForTemplate(lc, tpl);
      assert.ok(tiles && tiles.length, `${tpl.template_id} ${lc} has tiles`);
      const joined = strip(finalizeSentence(lc, tiles.map((s) => s.text).join(" ")));
      assert.equal(joined, strip(buildSentence(lc, tpl)), `${tpl.template_id} ${lc}`);
    }
  }
});

test("fixed-form templates tokenize into faithful tiles", () => {
  const cases = [
    ["THIS_IS_A_GOOD_BOOK", "uk", ["це", "добра", "книга"]],
    ["WE_GO_NORTH", "uk", ["ми", "йдемо", "на", "північ"]],
    ["WHO_EATS", "uk", ["хто", "їсть"]],
    ["IS_THAT_YOUR_PHONE", "uk", ["то", "твій", "телефон"]],
  ];
  for (const [id, lc, expected] of cases) {
    const tiles = sentenceTilesForTemplate(lc, tplById(id));
    assert.deepEqual(tiles.map((s) => s.text.toLowerCase()), expected, `${id} ${lc}`);
  }
  // Spaceless scripts keep the legacy per-concept path (null → caller falls back).
  assert.equal(sentenceTilesForTemplate("ja", tplById("WHO_EATS")), null);
});

test("a seeded drilled modifier appears in prompt, tiles, and answer alike", () => {
  // User-reported shape: prompt "They read a red book." with no tile for
  // "red". When a modifier is drilled, app.js seeds sharedChoices with it;
  // every consumer of that cache must then contain the word.
  const tpl = tplById("HE_READ_BOOK");
  const sc = { adj_BOOK: "RED", num_BOOK: null };
  assert.equal(buildSentence("en", tpl, null, sc), "He reads a red book.");
  assert.equal(buildSentence("uk", tpl, null, sc), "Він читає червону книгу.");
  const ukTiles = sentenceTilesForTemplate("uk", tpl, { adj_BOOK: "RED", num_BOOK: null });
  assert.ok(ukTiles.some((s) => s.text.includes("червону")), "uk tile carries the adjective");
  // And the suppressed case stays modifier-free.
  const plain = { adj_BOOK: null, num_BOOK: null };
  assert.equal(buildSentence("uk", tpl, null, plain), "Він читає книгу.");
});

test("an authored surface the engine cannot derive wins over injected modifiers", () => {
  // User-reported: "You go red home." / would-be «Ти йдеш червоний дім».
  // Injecting an adjective used to discard the authored adverbial surface
  // («додому», "eve") and rebuild the slot from the dictionary form. The
  // authored surface now wins outright; hadModifier stays false so L6/L7
  // (and L2's support-sentence choice) know the modifier did not land.
  const tpl = tplById("I_GO_HOME");
  const sc = () => ({ adj_HOME: "RED", num_HOME: null });
  const uk = buildSentenceWithRules("uk", tpl, null, sc());
  assert.equal(uk.sentence, "Я йду додому.");
  assert.equal(uk.hadModifier, false);
  const tr = buildSentenceWithRules("tr", tpl, null, sc());
  assert.equal(tr.sentence, "Ben eve giderim.");
  assert.equal(tr.hadModifier, false);
  // Surfaces the engine derives identically anyway (the regular accusative
  // «книгу») keep accepting modifiers — «червону книгу» must not regress.
  const book = buildSentenceWithRules("uk", tplById("HE_READ_BOOK"),
    null, { adj_BOOK: "RED", num_BOOK: null });
  assert.equal(book.sentence, "Він читає червону книгу.");
  assert.equal(book.hadModifier, true);
});

test("hadModifier reports the render fact, not the seeding intent", () => {
  // The L6/L7 guard relies on this asymmetry: the same seeded cache lands
  // the adjective in the en support but not in a target whose render path
  // cannot express it — a case-governed uk noun, or the tr have-possession
  // structure. The exercise must then bail rather than show a prompt word
  // with no matching tile (the "They have red clothes." screenshot).
  const gym = tplById("I_GO_TO_GYM");
  assert.equal(buildSentenceWithRules("uk", gym, null,
    { adj_GYM: "BIG", num_GYM: null }).hadModifier, false);
  assert.equal(buildSentenceWithRules("en", gym, null,
    { adj_GYM: "BIG", num_GYM: null }).hadModifier, true);
  const clothes = tplById("WE_HAVE_CLOTHES");
  assert.equal(buildSentenceWithRules("tr", clothes, null,
    { adj_CLOTHES: "RED", num_CLOTHES: null }).hadModifier, false);
  // uk expresses it fine — and reports so.
  const uk = buildSentenceWithRules("uk", clothes, null,
    { adj_CLOTHES: "RED", num_CLOTHES: null });
  assert.equal(uk.sentence, "Ми маємо червоний одяг.");
  assert.equal(uk.hadModifier, true);
});

test("noModifier nouns reject drilled and random modifiers in every language", () => {
  // HOME renders adverbially ("home", «додому», "eve") — "red home" is not
  // a noun phrase in any of them, so neither the drilled-modifier seeding
  // nor random injection may ever pick it.
  assert.equal(adjectiveSuitsNoun("RED", "HOME"), false);
  for (const lc of ["en", "uk", "pt", "tr", "it"]) {
    assert.equal(isModifierCompatible(lc, "RED", "HOME"), false, `adj ${lc}`);
    assert.equal(isModifierCompatible(lc, "TWO", "HOME"), false, `num ${lc}`);
  }
});

test("TABLE declines through the uk preposition cases", () => {
  // The reason TABLE was added: a concrete landmark noun for preposition
  // drills. на + locative, під + instrumental, поруч із + instrumental,
  // за + instrumental, до + genitive.
  assert.equal(buildSentence("uk", tplById("BOOK_ON_TABLE")), "Книга на столі.");
  assert.equal(buildSentence("uk", tplById("PHONE_UNDER_TABLE")), "Телефон під столом.");
  assert.equal(buildSentence("uk", tplById("BOOK_NEXT_TO_TABLE")), "Книга поруч із столом.");
  assert.equal(buildSentence("uk", tplById("PHONE_BEHIND_TABLE")), "Телефон за столом.");
  assert.equal(buildSentence("uk", tplById("I_GO_TO_TABLE")), "Я йду до столу.");
});

test("TABLE templates match their authored English", () => {
  for (const id of ["BOOK_ON_TABLE", "PHONE_UNDER_TABLE", "BOOK_NEXT_TO_TABLE", "PHONE_BEHIND_TABLE"]) {
    const tpl = tplById(id);
    assert.ok(tpl, `${id} exists`);
    assert.equal(buildSentence("en", tpl), tpl.render.en, id);
  }
  // I_GO_TO_TABLE reads definite in the authored English ("the table") but
  // generates indefinite — the same accepted divergence as I_GO_TO_HOUSE.
  assert.equal(buildSentence("en", tplById("I_GO_TO_TABLE")), "I go to a table.");
});

test("copular gender clash blocks mismatched subject/predicate pairs", () => {
  // The guard behind both templateEligible() and the subject-variation
  // filter in maybeVarySubject() — the swap that shipped "He is a girl."
  assert.equal(copularGenderClash("HE", "GIRL"), true);
  assert.equal(copularGenderClash("SHE", "BOY"), true);
  assert.equal(copularGenderClash("SHE", "GIRL"), false);
  assert.equal(copularGenderClash("HE", "BOY"), false);
  // Ungendered participants never clash: "I am a girl", "They are girls"
  // and gender-neutral predicates ("He is a leader") all stay allowed.
  assert.equal(copularGenderClash("FIRST_PERSON_SINGULAR", "GIRL"), false);
  assert.equal(copularGenderClash("THIRD_PERSON_PLURAL", "GIRL"), false);
  assert.equal(copularGenderClash("HE", "FOOD"), false);
});

test("isDirectObjectPosition: SVO detects a preceding non-copular verb", () => {
  // SVO: [subject, verb, object] — the noun's previous slot is the verb.
  const ordered = ["FIRST_PERSON_SINGULAR", "EAT", "FOOD"];
  assert.equal(isDirectObjectPosition(ordered, 2, "en"), true);
  // A copular predicate («I am a man»: [SUBJ, BE, MAN]) is not an object.
  const copular = ["FIRST_PERSON_SINGULAR", "BE", "MAN"];
  assert.equal(isDirectObjectPosition(copular, 2, "en"), false);
});

test("isDirectObjectPosition: SOV languages find their verb after the object", () => {
  // SOV: [subject, object, verb] — the verb trails the noun.
  const ordered = ["FIRST_PERSON_SINGULAR", "FOOD", "EAT"];
  for (const sov of ["tr", "ja", "ko"]) {
    assert.equal(isDirectObjectPosition(ordered, 1, sov), true,
      `${sov} treats the pre-verb noun as a direct object`);
  }
  // The same shape, read with no language declared, keeps the old SVO
  // walk and returns false — the SOV fix only fires where it is declared.
  assert.equal(isDirectObjectPosition(ordered, 1, null), false);
  assert.equal(isDirectObjectPosition(ordered, 1, "en"), false);
});

test("isDirectObjectPosition: SOV skips modifiers between the noun and its verb", () => {
  // [subject, adjective, object, verb] — «I good book read»
  const ordered = ["FIRST_PERSON_SINGULAR", "OLD", "FOOD", "EAT"];
  assert.equal(isDirectObjectPosition(ordered, 2, "tr"), true);
  // [subject, object, adjective, verb] — modifier trailing before the verb
  // should also be skipped
  const trailing = ["FIRST_PERSON_SINGULAR", "FOOD", "OLD", "EAT"];
  assert.equal(isDirectObjectPosition(trailing, 1, "tr"), true);
});

test("isDirectObjectPosition: SOV predicate noun before BE is not a direct object", () => {
  // «Ben adamım» / «저는 남자예요» underlying shape: [SUBJ, PREDICATE_NOUN, BE]
  const ordered = ["FIRST_PERSON_SINGULAR", "MAN", "BE"];
  for (const sov of ["tr", "ja", "ko"]) {
    assert.equal(isDirectObjectPosition(ordered, 1, sov), false,
      `${sov} excludes copular predicates from the direct-object slot`);
  }
});

test("isCopularPredicatePosition: SVO and SOV both find the copula", () => {
  // SVO: [SUBJ, BE, PREDICATE] — predicate looks backward for BE.
  const svo = ["FIRST_PERSON_SINGULAR", "BE", "MAN"];
  assert.equal(isCopularPredicatePosition(svo, 2, "en"), true);
  assert.equal(isCopularPredicatePosition(svo, 0, "en"), false);
  // SOV: [SUBJ, PREDICATE, BE] — predicate looks forward for BE.
  const sov = ["FIRST_PERSON_SINGULAR", "MAN", "BE"];
  for (const lang of ["tr", "ja", "ko"]) {
    assert.equal(isCopularPredicatePosition(sov, 1, lang), true,
      `${lang} finds the trailing copula`);
  }
  // A non-copular verb in the same trailing slot is not a copula match.
  const trans = ["FIRST_PERSON_SINGULAR", "FOOD", "EAT"];
  for (const lang of ["tr", "ja", "ko"]) {
    assert.equal(isCopularPredicatePosition(trans, 1, lang), false,
      `${lang} does not treat a transitive verb as a copula`);
  }
});

test("templateGenderClash flags a copular template after a bad subject swap", () => {
  const tpl = tplById("YOU_ARE_GIRL");
  assert.ok(tpl, "core template YOU_ARE_GIRL exists");
  assert.equal(templateGenderClash(tpl), false);
  // The same template with its subject rotated to HE — the exact shape
  // maybeVarySubject() builds — must be recognized as a clash.
  const swapped = {
    ...tpl,
    concepts: tpl.concepts.map((c) => (c === "SECOND_PERSON" ? "HE" : c)),
  };
  assert.equal(templateGenderClash(swapped), true);
  // Non-copular templates are exempt: "He has a girl[friend]"-shaped
  // transitives don't identify subject with object.
  assert.equal(
    templateGenderClash({ concepts: ["HE", "HAVE", "GIRL"] }),
    false
  );
});
