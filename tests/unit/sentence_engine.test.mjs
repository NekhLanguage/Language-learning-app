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
  getVerbForm,
  orderedConceptsForTemplate,
  frenchElision,
  englishIndefiniteArticle,
  pluralize,
  nounPhrase,
  surfaceForm,
  adjectiveSuitsNoun,
  isModifierCompatible,
  nounWithPossessive,
  blankSentence,
  ZERO_PRESENT_COPULA,
  PLURAL_EXCEPTIONS,
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

test("zero-copula languages are uk, ar, tr", () => {
  assert.deepEqual([...ZERO_PRESENT_COPULA].sort(), ["ar", "tr", "uk"]);
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
  assert.equal(buildSentence("ja", tplById("I_EAT_FOOD")), "わたしは食べ物を食べる。");
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

test("every core template renders a non-empty English sentence", () => {
  const core = templates.filter((t) => t._file === "sentence_templates.json");
  assert.ok(core.length > 100, "core template set is present");
  for (const tpl of core) {
    const s = buildSentence("en", tpl);
    assert.ok(s && s.trim().length > 0, `${tpl.template_id} rendered empty`);
  }
});

test("Turkish accusative fires on definite direct objects", () => {
  // Nouns with a definiteness signal in the template (ONLY, ALL,
  // THIS/THAT/IT, possessive) surface in the accusative. All four target
  // templates use the data-first `accusative` field.
  assert.equal(
    buildSentence("tr", tplById("I_READ_ONLY_BOOK")),
    "Ben sadece kitabı okurum.",
    "ONLY + BOOK: kitap → kitabı (p→b, -ı)"
  );
  assert.equal(
    buildSentence("tr", tplById("WE_EAT_ALL")),
    "Biz hepsini yeriz.",
    "ALL as object: hep → hepsini (frozen possessive form)"
  );
  assert.equal(
    buildSentence("tr", tplById("WE_STOP_EATING")),
    "Biz yemeyi bırakırız.",
    "control-verb chain: EAT nominalized to yemeyi + STOP surface"
  );
});

test("Turkish demonstrative-object accusative + bonus close on I_EAT_BREAKFAST", () => {
  // THIS in object position renders bunu; the by-hand prep-object HAND
  // stays bare (instrumental case is out of scope) so I_DO_THIS_BY_HAND
  // is a half-ship — accusative half is correct.
  const s = buildSentence("tr", tplById("I_DO_THIS_BY_HAND"));
  assert.ok(s.includes("bunu"), `THIS → bunu; got ${JSON.stringify(s)}`);
  assert.ok(!s.includes(" eli "), `HAND stays bare (prep-object), not accusative; got ${JSON.stringify(s)}`);
  // I_EAT_BREAKFAST closes as a bonus via the new tr main-verb surface
  // path (kahvaltı yapmak, not yemek).
  assert.equal(
    buildSentence("tr", tplById("I_EAT_BREAKFAST")),
    "Ben kahvaltı yaparım.",
    "tr surface override on main verb: EAT → yaparım"
  );
});

test("Turkish indefinite direct objects stay bare (accusative gates on definiteness)", () => {
  // Without a definiteness signal, the object is indefinite — bare on
  // main HEAD (the `bir` article ship covers the countable-indefinite
  // article separately). These stay baselined until `bir` merges.
  const heRead = buildSentence("tr", tplById("HE_READ_BOOK"));
  assert.ok(heRead.includes("kitap") && !heRead.includes("kitabı"),
    `HE_READ_BOOK stays indefinite; got ${JSON.stringify(heRead)}`);
  const sheSees = buildSentence("tr", tplById("SHE_SEES_PHONE"));
  assert.ok(sheSees.includes("telefon") && !sheSees.includes("telefonu"),
    `SHE_SEES_PHONE stays indefinite; got ${JSON.stringify(sheSees)}`);
});

test("Turkish accusative does not fire in copular templates or on subjects", () => {
  // THIS_IS_MY_HAND has THIS + possessive (both definiteness signals) but
  // no non-copular verb — the trTemplateHasActionVerb gate must keep HAND
  // out of the accusative branch. Predicate form is possessive "elim",
  // not accusative "eli".
  const s = buildSentence("tr", tplById("THIS_IS_MY_HAND"));
  assert.ok(!/\beli\b/.test(s),
    `copular predicate stays out of accusative; got ${JSON.stringify(s)}`);
});
