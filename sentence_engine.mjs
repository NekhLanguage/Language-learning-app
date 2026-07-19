// sentence_engine.mjs
// Sentence-generation core extracted from app.js so it can be shared by the
// browser app AND offline validators/tests (validation/validate-sentences.mjs).
// Kept as an explicit ES module (.mjs) so Node treats it as ESM on every
// version (Node < 22 would otherwise parse a bare .js as CommonJS and fail the
// named imports), while the browser loads it via app.js's `import`.
// The browser configures live accessors; the validator injects a full vocab
// snapshot + a seeded RNG for deterministic, reproducible runs.

let _vocab        = () => (typeof window !== 'undefined' ? window.GLOBAL_VOCAB : undefined);
let _getReleased  = () => (typeof window !== 'undefined' && window.run ? window.run.released : []);
let ensureProgress = (cid) => ({ level: 99, completed: false });
let _rng          = () => Math.random();

export function configureEngine(opts = {}) {
  if (opts.vocab)          _vocab = opts.vocab;
  if (opts.getReleased)    _getReleased = opts.getReleased;
  if (opts.ensureProgress) ensureProgress = opts.ensureProgress;
  if (opts.rng)            _rng = opts.rng;
}

function vocab()       { return _vocab(); }
function getReleased() { return _getReleased(); }
function rng()         { return _rng(); }

// --- Grammar-rule tracing ------------------------------------------------
// While a buildSentenceWithRules() call is in flight, rule sites record the
// stable rule id of each grammar phenomenon they apply. This keys the
// learner-facing "why?" explanations. noteRule() is a no-op outside a traced
// build, so direct helper calls (option tiles, prompts) cost nothing.
export const GRAMMAR_RULE_IDS = [
  "verb_agreement",          // verb conjugates for the subject's person/number
  "zero_copula",             // uk/ar/tr drop present-tense "to be"
  "zh_predicate_adjective",  // zh uses 很, not 是, before predicate adjectives
  "post_nominal_adjective",  // pt/ar place the adjective after the noun
  "french_elision",          // je aime → j'aime, le eau → l'eau
  "french_possessive_agreement", // sa/son agrees with the possessed noun
  "gender_agreement",        // modifier takes the noun's gender form
  "sov_word_order",          // ja/ko/tr put the verb at the end
  "vso_word_order",          // ar leads with the verb
  "indefinite_article",      // a/an, um/uma, ein/eine, … chosen by gender/sound
  "ja_counter",              // ja numbers attach through a counter + の
  "accusative_object",       // uk direct objects take the accusative ending
  "prepositional_case",      // uk prepositions govern the noun's case ending
  "definite_article",        // the/o/der/… for a described noun subject
];

let firedRules = null;
let tracedModifier = false;
function noteRule(id) {
  if (firedRules) firedRules.add(id);
}
// Marks the traced build as carrying an adjective/number modifier — the
// sentence then differs from the plain template, so authored render strings
// no longer describe it.
function noteModifier() {
  if (firedRules) tracedModifier = true;
}

// Like buildSentence, but also reports which grammar rules fired while
// building and whether a modifier made the sentence diverge from the plain
// template — { sentence, rules, hadModifier }.
function buildSentenceWithRules(lang, tpl, forcedConcept = null, sharedChoices = null) {
  firedRules = new Set();
  tracedModifier = false;
  try {
    const sentence = buildSentence(lang, tpl, forcedConcept, sharedChoices);
    return { sentence, rules: [...firedRules], hadModifier: tracedModifier };
  } finally {
    firedRules = null;
    tracedModifier = false;
  }
}

 function formOf(lang, cid) {
  const entry = vocab().languages?.[lang]?.forms?.[cid];

  if (!entry) return cid;

  // nouns
  if (typeof entry === "object" && entry.form) {
    return entry.form;
  }

  // pronouns
  if (Array.isArray(entry)) {
    return entry[0];
  }

  // verbs (base/infinitive)
  if (typeof entry === "object" && entry.base) {
    return entry.base;
  }

  // fallback: pick first string value in object
  if (typeof entry === "object") {
    const first = Object.values(entry).find(v => typeof v === "string");
    if (first) return first;
  }

  if (typeof entry === "string") return entry;

  return cid;
}
// Returns "a" or "an" based on the first letter of the following word.
// Covers the standard vowel-sound rule (a, e, i, o, u).
// entry.article can still override for genuine exceptions (e.g. "an hour", "a unicorn").
function englishIndefiniteArticle(nextWord) {
  if (!nextWord) return "a";
  const first = nextWord.trim()[0]?.toLowerCase();
  return (first === "a" || first === "e" || first === "i" || first === "o" || first === "u")
    ? "an"
    : "a";
}

const PLURAL_EXCEPTIONS = {
  child: "children",
  mouse: "mice",
  person: "people",
  man: "men",
  woman: "women",
  tooth: "teeth",
  foot: "feet",
  goose: "geese",
  ox: "oxen",
};

function pluralize(word) {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (PLURAL_EXCEPTIONS[lower]) {
    // preserve original capitalisation
    return word[0] === word[0].toUpperCase()
      ? PLURAL_EXCEPTIONS[lower][0].toUpperCase() + PLURAL_EXCEPTIONS[lower].slice(1)
      : PLURAL_EXCEPTIONS[lower];
  }
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + "es";
  return word + "s";
}

// Returns true when subject and predicate noun would clash in semantic
// gender — e.g. "He is a witch" (HE: m, WITCH: f). Only meaningful in
// copular templates ("X is Y"); in transitive templates ("X has Y") the
// noun's gender is independent of the subject.
function copularGenderClash(subjectCid, nounCid) {
  const subjGender = vocab().concepts?.[subjectCid]?.gender;
  const nounGender = vocab().concepts?.[nounCid]?.gender;
  if (!subjGender || !nounGender) return false;
  return subjGender !== nounGender;
}

// Walks a template's concepts, returns true when the template is copular
// (uses BE) and the subject pronoun's gender clashes with any predicate
// noun's gender. Used to filter out templates like "HE + BE + WITCH"
// before the renderer wastes effort building a broken sentence.
function templateGenderClash(tpl) {
  const concepts = tpl?.concepts || [];
  if (!concepts.includes("BE")) return false;
  const subjectCid = concepts.find(c =>
    vocab().concepts?.[c]?.type === "pronoun"
  );
  if (!subjectCid) return false;
  return concepts.some(c => {
    const m = vocab().concepts?.[c];
    return m?.type === "noun" && copularGenderClash(subjectCid, c);
  });
}

// Returns the plural form for non-English languages.
// Reads entry.plural if present; falls back to the singular formOf().
// Respects entry.invariantPlural for words that don't change (e.g. Pokémon).
function pluralFormOf(lang, cid) {
  const entry = vocab().languages?.[lang]?.forms?.[cid];
  if (!entry) return formOf(lang, cid);
  if (typeof entry === "object" && !Array.isArray(entry)) {
    if (entry.invariantPlural || entry.pluralOnly) return formOf(lang, cid);
    if (entry.plural) return entry.plural;
  }
  return formOf(lang, cid);
}

// Returns the form of a modifier (adjective / possessive) that agrees in
// gender with the noun it qualifies. Falls back to the masculine/base form
// when the language doesn't store gendered variants for that modifier, or
// when the noun has no recorded gender — keeping non-PT/UK languages working
// unchanged.
function genderedFormOf(lang, modifierCid, nounCid, plural = false) {
  const mod = vocab().languages?.[lang]?.forms?.[modifierCid];
  if (!mod || typeof mod !== "object" || Array.isArray(mod)) {
    return plural ? pluralFormOf(lang, modifierCid) : formOf(lang, modifierCid);
  }
  const noun = vocab().languages?.[lang]?.forms?.[nounCid];
  const g = noun?.gender;
  if (plural) {
    if (g === "f" && mod.fp) { noteRule("gender_agreement"); return mod.fp; }
    if (g === "n" && mod.np) { noteRule("gender_agreement"); return mod.np; }
    return pluralFormOf(lang, modifierCid);
  }
  if (g === "f" && mod.f) { noteRule("gender_agreement"); return mod.f; }
  if (g === "n" && mod.n) { noteRule("gender_agreement"); return mod.n; }
  return formOf(lang, modifierCid);
}

// Returns true when the concept's pronoun metadata declares plural number
// (FIRST_PERSON_PLURAL, SECOND_PERSON_PLURAL, THIRD_PERSON_PLURAL).
function isPluralPronoun(cid) {
  return vocab().concepts?.[cid]?.number === "plural";
}

// --- Ukrainian direct-object case ------------------------------------------
// Ukrainian has no articles; the work an article does in en/pt/de is done by
// the noun's case ending instead, so a direct object must be rendered in the
// accusative: «я п'ю воду», not the dictionary form «вода». Feminine -а/-я
// shifts to -у/-ю; the shift applies to every а/я-final word of a multi-word
// form so embedded adjectives agree too («бігова доріжка» → «бігову доріжку»)
// while genitive tails are untouched («таблиця лідерів» → «таблицю лідерів»).
function ukFeminineAccusative(form) {
  return String(form).split(" ").map(w =>
    w.endsWith("а") ? w.slice(0, -1) + "у" :
    w.endsWith("я") ? w.slice(0, -1) + "ю" : w
  ).join(" ");
}

// Inanimate masculine and neuter accusative equals the nominative. Animate
// masculines (брат → брата) follow no safe suffix rule, so they carry an
// explicit `accusative` field in the vocab data, which always wins.
function ukAccusativeNoun(cid, base) {
  const entry = vocab().languages?.uk?.forms?.[cid];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return base;
  if (typeof entry.accusative === "string") return entry.accusative;
  if (entry.gender === "f") return ukFeminineAccusative(base);
  return base;
}

// A noun at ordered[idx] is a direct object when the nearest preceding
// concept — skipping the noun's own modifiers (possessive, adjective,
// quantifier, number: «я маю мою книгу», «я читаю лише книгу») — is a
// non-copular verb. Predicate nouns after BE («це книга») stay nominative.
const OBJECT_MODIFIER_TYPES = new Set(["adjective", "quantifier", "number"]);

// Concept metadata of the word directly before ordered[idx] (or null).
function prevMetaEarly(ordered, idx) {
  return idx > 0 ? vocab().concepts?.[ordered[idx - 1]] ?? null : null;
}
function isDirectObjectPosition(ordered, idx) {
  let j = idx - 1;
  while (j >= 0) {
    const m = vocab().concepts?.[ordered[j]];
    if (m?.semantic_role === "possessive" || OBJECT_MODIFIER_TYPES.has(m?.type)) { j--; continue; }
    break;
  }
  if (j < 0) return false;
  const prev = ordered[j];
  return vocab().concepts?.[prev]?.type === "verb" && !isCopulaConcept(prev);
}

// --- Ukrainian prepositional case -------------------------------------------
// uk prepositions govern the case of the nominal(s) that follow: «на цьому»
// (locative), «перед книгою» (instrumental), «до будинку» (genitive). Purely
// data-driven: a form only changes when its entry carries the matching case
// field, so entries without case data — and every other language — are
// untouched. The pending case survives modifiers and conjunctions («між цим
// і тим») and clears at a verb.
const UK_PREP_CASE = {
  ON: "locative", IN: "locative", OFF: "locative",
  UNDER: "instrumental", BEHIND: "instrumental", FRONT: "instrumental",
  BETWEEN: "instrumental", NEXT_TO: "instrumental", BY: "instrumental",
  WITH: "instrumental",
  TO: "genitive", FROM: "genitive", FOR: "genitive",
};

// Case each ordered position is governed by (uk only; null elsewhere).
function ukCaseMap(lang, ordered) {
  if (lang !== "uk") return ordered.map(() => null);
  let pending = null;
  return ordered.map((cid) => {
    if (UK_PREP_CASE[cid]) { pending = UK_PREP_CASE[cid]; return null; }
    const t = vocab().concepts?.[cid]?.type;
    if (t === "verb") { pending = null; return null; }
    if (t === "noun" || t === "pronoun") return pending;
    return null; // modifiers / conjunctions pass the case along
  });
}

// The declined form for a governed nominal, or null when no data exists.
function ukCaseForm(cid, caseName) {
  if (!caseName) return null;
  const entry = vocab().languages?.uk?.forms?.[cid];
  if (entry && !Array.isArray(entry) && typeof entry === "object" &&
      typeof entry[caseName] === "string") {
    return entry[caseName];
  }
  return null;
}

// --- Definite article for described noun subjects ----------------------------
// A noun subject being described takes the definite article: "The book is
// red", «O livro é vermelho», "Das Buch ist auf diesem". English leaves
// seasons bare ("Winter is cold") while the others keep the article. no
// suffixes definiteness onto the noun instead (bok → boken, hus → huset).
// Article-less languages (uk/ar/tr/ja/ko/zh) return the bare form.
const DEFINITE_SUBJECT_STRUCTURES = new Set([
  "copular", "spatial_relation", "spatial_relation_complex",
  "time_description",
]);

// Templates in the franchise packs ship without the `structure` field, but
// [noun-subject, BE, adjective] is structurally copular whenever the subject
// picks out a specific referent ("The striker is aggressive"). Some packs
// (fitness) instead author the same shape as a generic definition ("A muscle
// is sore", "Protein is healthy") — the engine cannot distinguish those two
// readings from concepts alone, so it reads the authored EN render as the
// author's declaration of intent: a leading "The " means definite-subject
// copular; anything else keeps the current indefinite/bare behavior. Only
// fires when `structure` is absent, so explicit author intent (e.g.
// time_description on SEASON_IS_ADJ) still wins unchanged.
function effectiveStructureType(tpl) {
  if (tpl?.structure?.type) return tpl.structure.type;
  const concepts = tpl?.concepts;
  if (!Array.isArray(concepts) || concepts.length !== 3) return undefined;
  if (concepts[1] !== "BE") return undefined;
  const subj = vocab().concepts?.[concepts[0]];
  const pred = vocab().concepts?.[concepts[2]];
  if (subj?.type !== "noun" || subj.person || pred?.type !== "adjective") {
    return undefined;
  }
  const en = tpl?.render?.en;
  if (typeof en === "string" && /^The\s/.test(en)) return "copular";
  return undefined;
}

// English describes seasons bare ("Winter is cold"); the other article
// languages keep the definite article («O inverno é frio»).
const EN_BARE_SUBJECTS = new Set(["WINTER", "SUMMER", "SPRING", "AUTUMN"]);

function definiteNounPhrase(lang, cid) {
  const entry = vocab().languages?.[lang]?.forms?.[cid] || {};
  const base = entry.form || formOf(lang, cid);
  const g = entry.gender;
  const plural = !!entry.pluralOnly;

  if (lang === "en") {
    // Seasons read as proper-ish nouns in English: "Winter is cold".
    if (EN_BARE_SUBJECTS.has(cid)) return base;
    noteRule("definite_article");
    return "the " + base;
  }
  if (lang === "pt") {
    if (!g && !plural) return base; // no gender data — leave bare, not mis-gendered
    noteRule("definite_article");
    return (plural ? (g === "f" ? "as " : "os ") : (g === "f" ? "a " : "o ")) + base;
  }
  if (lang === "es") {
    if (!g && !plural) return base;
    noteRule("definite_article");
    return (plural ? (g === "f" ? "las " : "los ") : (g === "f" ? "la " : "el ")) + base;
  }
  if (lang === "fr") {
    if (!g && !plural) return base;
    noteRule("definite_article");
    // «le eau» is contracted to «l'eau» by the elision pass.
    return (plural ? "les " : (g === "f" ? "la " : "le ")) + base;
  }
  if (lang === "de") {
    if (!g && !plural) return base;
    noteRule("definite_article");
    return (plural ? "die " : (g === "f" ? "die " : g === "n" ? "das " : "der ")) + base;
  }
  if (lang === "el") {
    if (!g && !plural) return base;
    noteRule("definite_article");
    if (plural) return (g === "n" ? "τα " : "οι ") + base;
    return (g === "m" ? "ο " : g === "f" ? "η " : "το ") + base;
  }
  if (lang === "no") {
    // Definite suffix: plural +ene (sko → skoene), -e final +n (bukse →
    // buksen), neuter +et (hus → huset), else +en (bok → boken).
    noteRule("definite_article");
    if (plural) return base + "ene";
    if (g === "n") return base + (base.endsWith("e") ? "t" : "et");
    if (base.endsWith("e")) return base + "n";
    return base + "en";
  }
  if (lang === "it") {
    if (!g && !plural) return base;
    noteRule("definite_article");
    if (plural) {
      if (g === "f") return "le " + base;
      return (IT_LO_INITIAL.test(base) || IT_VOWEL_INITIAL.test(base) ? "gli " : "i ") + base;
    }
    if (IT_VOWEL_INITIAL.test(base)) return "l'" + base;
    if (g === "f") return "la " + base;
    return (IT_LO_INITIAL.test(base) ? "lo " : "il ") + base;
  }
  return base;
}

// Languages whose nounPhrase adds an indefinite article (the branches below).
// tr's "bir" is invariant (no gender/harmony), which makes the shape identical
// to the other article languages even though Turkish has no definite article.
const ARTICLE_LANGS = new Set(["en", "pt", "no", "de", "el", "es", "fr", "it", "tr"]);

// Italian article allomorphy is phonological: masculine takes lo/gli/uno
// before s+consonant, z, gn, ps, pn, x, y («lo zaino», «gli gnocchi»,
// «uno sport»); l'/un' elide before a vowel («l'ora», «un'amica»); plain
// il/i/un/una elsewhere.
const IT_LO_INITIAL = /^(s[bcdfghj-np-tv-z]|z|gn|ps|pn|x|y)/i;
const IT_VOWEL_INITIAL = /^[aeiouàèéìíòóùú]/i;

// `opts.plural`: when true, render plural form and drop the indefinite
// article. Used when the predicate noun follows a plural subject pronoun
// ("they are wizards" not "they are a wizard").
// `opts.directObject`: when true, case-marking languages render the noun in
// its object case (uk accusative: «воду» not «вода»). Article languages
// ignore it — their objects look like any other noun phrase.
function nounPhrase(lang, cid, opts = {}) {

  const meta = vocab().concepts[cid];
  const entry = vocab().languages?.[lang]?.forms?.[cid] || {};

  let base = entry.form || formOf(lang, cid);
  if (lang === "uk" && opts.directObject && !opts.plural && !entry.pluralOnly) {
    const acc = ukAccusativeNoun(cid, base);
    if (acc !== base) {
      noteRule("accusative_object");
      base = acc;
    }
  }

  // pluralOnly nouns (e.g. clothes/shoes/pants) have no singular form and
  // never take an indefinite article. The bare form is already plural, so
  // both opts.plural and the article path return it unchanged. noArticle
  // marks per-language article-less usage on an otherwise ordinary noun
  // ("I eat breakfast", "Ich esse Frühstück" — but «le petit-déjeuner»).
  // Italian instead uses the plural partitive («Lei ha delle scarpe») and
  // marks a few definite-object nouns with `definite` («mangio la
  // colazione»).
  if (lang === "it" && entry.pluralOnly && entry.gender) {
    noteRule("indefinite_article");
    return (entry.gender === "f" ? "delle "
      : (IT_LO_INITIAL.test(base) || IT_VOWEL_INITIAL.test(base)) ? "degli " : "dei ") + base;
  }
  if (lang === "it" && entry.definite) {
    return definiteNounPhrase(lang, cid);
  }
  if (entry.pluralOnly || entry.noArticle) return base;

  if (opts.plural) {
    if (lang === "en") {
      return entry.invariantPlural ? base : pluralize(base);
    }
    return pluralFormOf(lang, cid);
  }

  // Mass / uncountable nouns never take an indefinite article ("learns magic",
  // "isst Fleisch"), even though they still carry gender for adjective
  // agreement. An explicit countable:false overrides the gender-based trigger
  // below.
  if (meta && meta.countable === false) return base;

  // Apply article logic when the concept is marked countable OR when the
  // form itself carries article/gender data (covers resource-pack nouns that
  // define articles without a countable flag on the concept).
  const hasArticleInfo = meta?.countable || entry.article || entry.gender;
  if (!hasArticleInfo) return base;

  if (lang === "en") {
    const article = entry.article || englishIndefiniteArticle(base);
    noteRule("indefinite_article");
    return article + " " + base;
  }

  if (lang === "pt") {
    const article = entry.gender === "f" ? "uma" : "um";
    noteRule("indefinite_article");
    return article + " " + base;
  }

  if (lang === "no") {
    noteRule("indefinite_article");
    // Bokmål: feminine nouns take "en" in the common-gender style the
    // authored corpus uses throughout ("en kvinne", not "ei kvinne").
    if (entry.gender === "n") return "et " + base;
    return "en " + base;
  }

  if (lang === "de") {
    if (!entry.gender) return base; // mass nouns / uncountable — no article
    noteRule("indefinite_article");
    if (entry.gender === "f") return "eine " + base;
    return "ein " + base; // m and n both use "ein"
  }

  if (lang === "el") {
    if (!entry.gender) return base; // mass nouns / uncountable — no article
    noteRule("indefinite_article");
    if (entry.gender === "m") return "ένας " + base;
    if (entry.gender === "f") return "μία " + base;
    return "ένα " + base; // neuter
  }

  if (lang === "es") {
    if (!entry.gender) return base;
    noteRule("indefinite_article");
    return (entry.gender === "f" ? "una " : "un ") + base;
  }

  if (lang === "fr") {
    if (!entry.gender) return base;
    noteRule("indefinite_article");
    return (entry.gender === "f" ? "une " : "un ") + base;
  }

  if (lang === "it") {
    if (!entry.gender) return base;
    noteRule("indefinite_article");
    if (entry.gender === "f") {
      return IT_VOWEL_INITIAL.test(base) ? "un'" + base : "una " + base;
    }
    return (IT_LO_INITIAL.test(base) ? "uno " : "un ") + base;
  }

  if (lang === "tr") {
    // "bir" is Turkish's only indefinite article — invariant, always
    // prenominal. Attaches to any countable noun that reaches this branch
    // (direct objects, predicate nouns after a personal pronoun subject).
    // Definite-subject structures, mass nouns, pluralOnly and noArticle
    // entries all short-circuit above, so a plain "bir X" here is safe.
    noteRule("indefinite_article");
    return "bir " + base;
  }

  return base;
}
function surfaceForm(lang, cid) {
  const meta = vocab().concepts[cid];

  if (!meta) return cid;

  if (meta.type === "noun") {
    return nounPhrase(lang, cid);
  }

  return formOf(lang, cid); // ✅ THIS is the correct fallback
}
  function getVerbForm(verbCid, subjectCid, lang) {
  const verbData = vocab().languages?.[lang]?.forms?.[verbCid];
  if (!verbData) return verbCid;

  const subject = vocab().concepts[subjectCid];
  if (!subject) return verbData.base || verbCid;

  // Effective grammatical person/number. Pronouns with explicit agreement use
  // it directly. Demonstratives (THIS/THAT), the neuter IT, and noun subjects
  // carry no person/number — they behave as 3rd person, so default them rather
  // than falling back to the infinitive ("This be" → "This is", "Це бути" →
  // "Це є"). Plural demonstratives, if any, map to 3rd plural.
  let person = subject.person;
  let number = subject.number;
  if (!person || !number) {
    person = 3;
    // Plural-only noun subjects conjugate plural: "the pants ARE black".
    const subjEntry = vocab().languages?.[lang]?.forms?.[subjectCid];
    const pluralOnlySubject = !!(subjEntry && typeof subjEntry === "object" &&
      !Array.isArray(subjEntry) && subjEntry.pluralOnly);
    number = (isPluralPronoun(subjectCid) || pluralOnlySubject) ? "plural" : "singular";
  }

  // Build dynamic key (e.g. "1_singular", "2_plural", etc.)
  let key = `${person}_${number}`;

// Portuguese: "você/vocês" conjugate like 3rd person
if (lang === "pt") {
  if (subjectCid === "SECOND_PERSON") key = "3_singular";
  if (subjectCid === "SECOND_PERSON_PLURAL") key = "3_plural";
}
  // 1️⃣ Exact match (preferred)
  if (verbData[key]) {
    if (verbData.base && verbData[key] !== verbData.base) noteRule("verb_agreement");
    return verbData[key];
  }

  // 2️⃣ If language defines a uniform present form (e.g. Norwegian)
  if (verbData.present) {
    return verbData.present;
  }

  // 3️⃣ If only base + 3_singular exist, use 3_singular
  const keys = Object.keys(verbData);
  const onlyBaseAndThird =
    keys.length === 2 &&
    keys.includes("base") &&
    keys.includes("3_singular");

  if (onlyBaseAndThird) {
  // English-style verbs (base + 3_singular)
  if (person === 3 && number === "singular") {
    noteRule("verb_agreement");
    return verbData["3_singular"];
  }
  return verbData.base;
}

  // 4️⃣ Final fallback
  return verbData.base || verbCid;
}

  function shuffle(arr) {
    return arr.sort(() => rng() - 0.5);
  }
  function safe(v) {
  return v ?? "";
}
function resolvePrompt(q, supportLang) {
  if (!q) return "";

  // Most flexible:
  // - if prompt is a string, use it
  // - if prompt is an object, use q.prompt[supportLang]
  // - otherwise fall back to English or the first available language
  const p = q.prompt;

  if (typeof p === "string") return p;

  if (p && typeof p === "object") {
    if (typeof p[supportLang] === "string") return p[supportLang];
    if (typeof p.en === "string") return p.en;

    const first = Object.values(p).find(v => typeof v === "string");
    if (first) return first;
  }

  return "";
}
// Relational templates are authored in correct linear order:
// subject-noun + copula + preposition + object ("the book is on this").
// The generic subject/verb/object heuristic below misreads the trailing
// demonstrative as the subject and strands the preposition at the end
// ("...phone off"), so preserve the authored order for these instead.
const RELATIONAL_STRUCTURES = new Set([
  "spatial_relation", "spatial_relation_complex"
]);

function orderedConceptsForTemplate(tpl, lang) {
  // 1) Use explicit order if present
  const explicit = tpl.order?.[lang] || tpl.order?.default;
  if (Array.isArray(explicit) && explicit.length) return explicit;

  // 1b) Relational templates: keep the authored concept order (see above).
  if (RELATIONAL_STRUCTURES.has(tpl.structure?.type) && Array.isArray(tpl.concepts)) {
    return tpl.concepts.slice();
  }

  // 1c) Fixed-form structures render from the authored string (see
  // AUTHORED_ONLY_STRUCTURES); their concept arrays are authored in linear
  // order, so word tiles / blanks should follow that order too, not the
  // generic subject-verb-object guess (which strands question words at
  // the end: "you go why").
  if (AUTHORED_ONLY_STRUCTURES.has(tpl.structure?.type) && Array.isArray(tpl.concepts)) {
    return tpl.concepts.slice();
  }

  // 2) Fallback: derive order based on basic word order
  //    This keeps things working even before you finish adding tpl.order everywhere.
  const concepts = tpl.concepts || [];

  const pronoun = concepts.find(c => vocab().concepts[c]?.type === "pronoun");
  const verb = concepts.find(c => vocab().concepts[c]?.type === "verb");
  // Copular templates ("X is Y") often have no pronoun — the subject is a noun
  // ("autumn is old", "the book is red"). Without this the leading noun is
  // misread as the object and stranded after the copula ("Be autumn old"),
  // and the copula has no subject to conjugate against. Treat the first noun
  // as the subject in that case.
  const isCopular = concepts.some(c =>
    c === "BE" || vocab().concepts[c]?.semantic_role === "copula"
  );
  const nounSubject = (!pronoun && isCopular)
    ? concepts.find(c => ["noun", "time"].includes(vocab().concepts[c]?.type))
    : null;
  const subject = pronoun || nounSubject;
  const object = concepts.find(c => {
    if (c === subject) return false;
    const t = vocab().concepts[c]?.type;
    return t && t !== "pronoun" && t !== "verb";
  });

  const WORD_ORDER = {
  ja: "SOV",
  // MSA's canonical order is VSO, but SVO is equally standard in modern
  // usage and it is what the authored corpus uses throughout («أنا أشرب
  // ماء»), so the generator matches it.
  ar: "SVO",
  en: "SVO",
  pt: "SVO",
  no: "SVO",
  ko: "SOV",
  uk: "SVO",
  de: "SVO",
  el: "SVO",
  tr: "SOV"
};

const orderType = WORD_ORDER[lang] || "SVO";

let ordered;

if (orderType === "SOV") {
  if (verb && object) noteRule("sov_word_order");
  ordered = [subject, object, verb];
} else if (orderType === "VSO") {
  if (verb && subject) noteRule("vso_word_order");
  ordered = [verb, subject, object];
} else {
  ordered = [subject, verb, object];
}

  // Add any remaining concepts (so we don't silently drop extras later)
  const used = new Set(ordered.filter(Boolean));
  concepts.forEach(c => { if (!used.has(c)) ordered.push(c); });

  return ordered.filter(Boolean);
}
  function blankSentence(sentence, surface) {
    const str = String(sentence || "");
    const target = String(surface || "").toLowerCase().trim();

    // If we don't know what to blank, don't pretend we did.
    if (!target) return str;

    // Use substring matching so multi-word surface forms (e.g. "gym leader",
    // "лідер залу") are found and blanked correctly.
    const idx = str.toLowerCase().indexOf(target);
    if (idx === -1) return str;

    return str.slice(0, idx) + "_____" + str.slice(idx + target.length);
  }

  function safeSurfaceForConcept(tpl, targetLang, targetConcept) {
    const meta = vocab().concepts[targetConcept];
    if (!meta) return null;

    const subjectCid = (tpl.concepts || []).find(c =>
      vocab().concepts[c]?.type === "pronoun"
    );

    if (meta.type === "verb") {
      return getVerbForm(targetConcept, subjectCid, targetLang);
    }

    const authored = tpl.surface?.[targetLang]?.[targetConcept];
    if (authored) return authored;

    // Match the case the engine actually renders: a uk noun in object
    // position appears in the accusative («воду»), and blanking/prompting
    // with the dictionary form would no longer find it in the sentence.
    if (targetLang === "uk" && meta.type === "noun") {
      const ordered = orderedConceptsForTemplate(tpl, targetLang);
      const idx = ordered.indexOf(targetConcept);
      if (idx !== -1 && isDirectObjectPosition(ordered, idx)) {
        return ukAccusativeNoun(targetConcept, formOf(targetLang, targetConcept));
      }
    }

    return formOf(targetLang, targetConcept);
  }

  function isModifierConcept(cid) {
  const t = vocab().concepts[cid]?.type;
  return t === "adjective" || t === "number";
}

// Source files that ship "broad" vocabulary — concepts from these files
// combine naturally with any noun. Pack-specific adjectives (e.g. SHINY
// from pokemon.json, or specialty terms from cooking/anime/etc.) are
// tied to their own pack context via the source match check below.
const BROAD_SOURCE_FILES = new Set([
  "adjectives.json","connectors.json","directions_positions.json",
  "glue_words.json","nouns.json","numbers.json",
  "politeness_modality.json","pronouns.json","quantifiers.json",
  "question_words.json","time_words.json","verbs.json"
]);

// Decides whether a modifier (adjective/number/etc.) should pair with a
// given noun. Two rules:
//   1. Mass/uncountable nouns reject modifiers entirely — avoids "big water"
//      / "two food" / "a shiny food" awkwardness.
//   2. Pack-specific modifiers only pair with nouns from the same pack
//      source; broad modifiers pair with anything.
// Per-adjective whitelist of noun semantic_role values we'll allow as
// modifier targets. Built from the existing role tags in adjectives.json
// and nouns.json. Anything not listed for a given adjective role falls
// through to the source-file rule below — so unknown roles preserve the
// original (broader) behaviour rather than blocking everything.
const ADJECTIVE_ROLE_COMPAT = {
  // Visible properties — apply to physical entities, exclude substances.
  property_color: new Set([
    "object","generic_object","place","clothing","clothing_item","vehicle",
    "animal","creature","fictional_creature","fictional_object","food_item",
    "drink_item","sport_item","tool","body_part","building","plant",
    "container","accessory"
  ]),
  property_size: new Set([
    "object","generic_object","place","clothing","clothing_item","vehicle",
    "animal","creature","fictional_creature","fictional_object","food_item",
    "drink_item","sport_item","tool","body_part","building","plant",
    "container","accessory","person","family","role"
  ]),
  // Speed only describes things that can move.
  property_speed: new Set([
    "vehicle","animal","creature","fictional_creature","sport_action",
    "game_action","process"
  ]),
  // Weight applies to physical objects and substances; not people, places, time.
  property_weight: new Set([
    "object","generic_object","food_item","drink_item","clothing",
    "clothing_item","vehicle","tool","sport_item","container","accessory",
    "substance"
  ]),
  property_brightness: new Set([
    "place","building","time_period","light_source","clothing","clothing_item",
    "object","generic_object","fictional_object","color"
  ]),
  // Direction adjectives (right/left) only sensibly modify body parts
  // ("right hand", "left foot") among the available noun inventory.
  property_direction: new Set(["body_part"]),
  // Difficulty applies to tasks/skills/subjects and also to readable/usable
  // objects ("easy book"); excludes people, places, substances, meals.
  property_difficulty: new Set([
    "task","skill","subject","exercise","game_action","sport_action","spell",
    "object","generic_object"
  ]),
  // Character traits (brave/strong-willed etc.) describe beings, not places
  // or things — never "a brave school".
  property_character: new Set([
    "person","family","role","animal","creature","fictional_creature"
  ]),
  // Broad quality/time properties (good/bad/nice, new/old) pair widely, so they
  // are deliberately omitted here to preserve the source-file fallback below.
  // The narrow members that used to share those roles are split out into their
  // own roles so we can constrain them without affecting the broad ones:
  //   YOUNG          -> property_youth        (animate age; never "young answer")
  //   CORRECT, WRONG -> property_correctness  (evaluable things; never "wrong magic")
  // These two have no allowlist (pack nouns rarely carry a semantic_role, so an
  // allowlist would wrongly block them all); they are constrained by the
  // exclusion table below instead.
};

// Per-adjective-role *exclusion* list. Unlike ADJECTIVE_ROLE_COMPAT (an
// allowlist), this only filters nouns we have explicitly tagged with a
// semantic_role — untagged concrete nouns keep pairing freely. This lets us
// suppress nonsense like "young answer" (youth -> abstract) and "wrong magic"
// (correctness -> substance) without enumerating every concrete noun role.
const ADJECTIVE_ROLE_BLOCK = {
  property_youth:       new Set(["abstract", "substance", "meal"]),
  property_correctness: new Set(["substance"]),
};

// Shared role-compatibility verdict used by both adjectiveSuitsNoun (forced
// drilled adjectives) and isModifierCompatible (random modifier injection):
// an allowlist hit must include the noun role; otherwise an exclusion hit
// rejects it; otherwise allow (broad).
function adjectiveRoleAllowsNoun(adjRole, nounRole) {
  const allowed = ADJECTIVE_ROLE_COMPAT[adjRole];
  if (allowed) return allowed.has(nounRole);
  const blocked = ADJECTIVE_ROLE_BLOCK[adjRole];
  if (blocked && blocked.has(nounRole)) return false;
  return true;
}

// Language-independent semantic check: does this adjective make sense
// modifying this noun? Used when choosing a template for a drilled adjective
// (which gets forced onto the template's noun) so we don't produce "right
// revive" / "orange move". Mirrors the role allowlist in isModifierCompatible
// but skips the per-language article/gender gate, which is applied at render
// time. Broad adjectives (quality/time + pack adjectives without a role entry)
// pair widely and are left unconstrained.
function adjectiveSuitsNoun(adjCid, nounCid) {
  const adjMeta  = vocab().concepts[adjCid];
  const nounMeta = vocab().concepts[nounCid];
  if (!adjMeta || !nounMeta) return true;
  return adjectiveRoleAllowsNoun(adjMeta.semantic_role, nounMeta.semantic_role);
}

function isModifierCompatible(lang, modifierCid, nounCid) {
  const nounMeta  = vocab().concepts[nounCid];
  const nounEntry = vocab().languages?.[lang]?.forms?.[nounCid] || {};
  // An explicit countable:false always wins — gender data (added for
  // article/agreement) must not re-open mass nouns to "tre acqua".
  if (nounMeta?.countable === false) return false;
  const canTakeModifier = nounMeta?.countable || nounEntry.article || nounEntry.gender;
  if (!canTakeModifier) return false;

  const modMeta = vocab().concepts[modifierCid];
  if (!modMeta) return true;

  // Tighter semantic compatibility: an adjective role with an allowlist must
  // match the noun role; a role with an exclusion list rejects tagged nouns;
  // otherwise (broad quality/time adjectives) fall through to the source rule.
  if (!adjectiveRoleAllowsNoun(modMeta.semantic_role, nounMeta?.semantic_role)) {
    return false;
  }

  if (BROAD_SOURCE_FILES.has(modMeta.source)) return true;
  return modMeta.source === nounMeta?.source;
}

function buildSameTypeOptions(targetConcept, desiredTotal = 4, targetLang = null) {
  const meta = vocab().concepts[targetConcept];
  if (!meta) return null;

  const pool = getReleased().filter(cid => {
    if (cid === targetConcept) return false;
    const st = ensureProgress(cid);
    if (st.completed) return false;
    return vocab().concepts[cid]?.type === meta.type;
  });

  if (pool.length < desiredTotal - 1) return null;

  // Dedup by the DISPLAYED (target-language) surface form. Distinct concepts
  // can share a word in the target language (polysemy) — e.g. uk EASY and
  // LIGHT both render "легкий", es HIS/HER/THEIR all render "su" — which would
  // otherwise produce duplicate buttons. Seed the "seen" set with the correct
  // answer so it is always kept, then take distinct-surface distractors.
  if (targetLang) {
    const seen = new Set([formOf(targetLang, targetConcept)]);
    const distractors = [];
    for (const cid of shuffle(pool)) {
      const form = formOf(targetLang, cid);
      if (seen.has(form)) continue;
      seen.add(form);
      distractors.push(cid);
      if (distractors.length === desiredTotal - 1) break;
    }
    if (distractors.length < desiredTotal - 1) return null;
    return shuffle([targetConcept, ...distractors]);
  }

  return shuffle([targetConcept, ...shuffle(pool).slice(0, desiredTotal - 1)]);
}
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Thai writes without spaces between words — joins are spaceless there.
const SPACELESS_JOIN_LANGS = new Set(["th"]);
function joinWords(lang, words) {
  return words.filter(Boolean).join(SPACELESS_JOIN_LANGS.has(lang) ? "" : " ");
}

function joinSentence(words, punctuation = ".") {
  return capitalizeFirst(words.filter(Boolean).join(" ")) + punctuation;
}

// French obligatory elision/contraction, applied as a final pass to an assembled
// French sentence. Elision depends on the *following* word's initial sound, which
// is only known once the sentence is linearized, so it runs on the finished
// string rather than per word. Only a fixed closed set of words elide (never
// ma/ta/sa, which become mon/ton/son instead). Known minor edge: aspirated-h
// nouns (rare, e.g. «le héros») are over-elided; the mute-h words it fixes
// («l'homme», «l'heure», «l'hôtel») are far more common.
function frenchElision(s) {
  if (!s) return s;
  const matchCase = (orig, repl) =>
    orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase()
      ? repl[0].toUpperCase() + repl.slice(1)
      : repl;

  // Preposition + definite-article contractions (before elision).
  // Note: \b does not anchor before «à» (not a \w char), so match a leading
  // start/space boundary explicitly for the à-contractions.
  s = s
    .replace(/\bde les\b/gi, m => matchCase(m, "des"))
    .replace(/\bde le\b/gi,  m => matchCase(m, "du"))
    .replace(/(^|\s)(à) les\b/gi, (m, pre, a) => pre + matchCase(a, "aux"))
    .replace(/(^|\s)(à) le\b/gi,  (m, pre, a) => pre + matchCase(a, "au"));

  // Elision before a vowel or h.
  const ELIDE = { je: "j'", me: "m'", te: "t'", se: "s'", ne: "n'",
                  de: "d'", ce: "c'", le: "l'", la: "l'", que: "qu'" };
  // Lowercase vowels + h only: rendered French words are lowercase mid-sentence,
  // so a case-sensitive lookahead avoids eliding before a leaked UPPERCASE concept
  // id (e.g. «ce AND» must not become «c'AND») while still covering every real case.
  const VOWEL_H = "aàâäeéèêëiîïoôöuùûüh";
  const W = "je|me|te|se|ne|de|ce|le|la|que";
  const Wcap = W.split("|").map(w => w[0].toUpperCase() + w.slice(1)).join("|");
  s = s.replace(
    new RegExp("\\b(" + W + "|" + Wcap + ")(\\s+)(?=[" + VOWEL_H + "])", "g"),
    (m, w) => matchCase(w, ELIDE[w.toLowerCase()])
  );

  // «si» elides only before il / ils (never «si elle»).
  s = s.replace(/\b(si|Si)\s+(ils?\b)/g, (m, w, after) => matchCase(w, "s'") + after);

  return s;
}

// Single hook for per-language final passes on an assembled sentence.
function finalizeSentence(lang, sentence) {
  if (lang === "fr") {
    const elided = frenchElision(sentence);
    if (elided !== sentence) noteRule("french_elision");
    return elided;
  }
  // Ukrainian sets off its conjunctions with a comma: «сніданок, але не
  // обід», «..., тому що він удома» — and alternates в/у for euphony: «у»
  // between consonants («Телефон у тому»), «в» next to a vowel. Applied to
  // the finished string since clauses are assembled by several builders.
  if (lang === "uk") {
    let s = sentence.replace(/([^,])\s+(але|тому що)\s/g, "$1, $2 ");
    const C = "бвгґджзйклмнпрстфхцчшщщьБВГҐДЖЗЙКЛМНПРСТФХЦЧШЩ";
    s = s.replace(new RegExp(`([${C}])\\s+в\\s+(?=[${C}])`, "g"), "$1 у ");
    s = s.replace(new RegExp(`^В\\s+(?=[${C}])`), "У ");
    return s;
  }
  // Italian preposition + definite-article contractions, applied to the
  // finished string (mirrors frenchElision): «accanto a il telefono» →
  // «accanto al telefono», «a la sua stanza» → «alla sua stanza».
  if (lang === "it") {
    const HEADS = { a: "a", da: "da", su: "su", in: "ne", di: "de" };
    const TAILS = { il: "l", lo: "llo", la: "lla", "l'": "ll'", i: "i", gli: "gli", le: "lle" };
    return sentence.replace(
      /\b(a|da|su|in|di)\s+(il|lo|la|l'|i|gli|le)(\s|$)/gi,
      (m, prep, art, sp) => {
        const head = HEADS[prep.toLowerCase()];
        const tail = TAILS[art.toLowerCase()];
        if (!head || !tail) return m;
        // in+il → nel (not neil); di+il → del
        const joined = (head === "ne" || head === "de") && tail === "l" ? head + "l"
          : head + tail;
        return joined + (tail === "ll'" ? "" : sp);
      }
    );
  }
  // Thai uses no terminal punctuation ("?" is replaced by particles like
  // ไหม) and no commas — a clause boundary is a space. Word-level joining
  // is spaceless at assembly time (joinWords), so authored clause spaces
  // survive here untouched.
  if (lang === "th") {
    return sentence.replace(/,\s*/g, " ").replace(/[.?]+$/, "").trim();
  }
  // CJK text takes no inter-word spaces and a full-width stop. The generic
  // assembly paths join words with spaces and end with "." — normalize both
  // (ja's particle path emits no terminal punctuation at all).
  if (lang === "ja" || lang === "zh") {
    let s = sentence.replace(
      /([⺀-鿿、-ヿ＀-￯])\s+(?=[⺀-鿿、-ヿ＀-￯])/g,
      "$1"
    );
    s = s.replace(/\.$/, "。").replace(/\?$/, "？");
    if (!/[。？！]$/.test(s)) s += "。";
    return s;
  }
  return sentence;
}
function possessiveWord(lang, cid) {
  return surfaceForm(lang, cid);
}

// Vowel or mute-h initials that trigger French liaison/elision behaviour.
const FR_VOWEL_H = "aàâäeéèêëiîïoôöuùûüh";

// French possessive determiners agree with the *possessed noun*, not the
// possessor: «sa fille» (f) / «son père» (m). A feminine noun beginning with a
// vowel or mute-h takes the masculine form instead, to avoid hiatus: «son amie»,
// «mon eau», «ton heure» — never «sa amie» (ma/ta/sa switch to mon/ton/son rather
// than eliding). Possessives are stored as ordered arrays: [masc, fem, plural]
// for mon/ton/son, and [singular, plural] for the gender-invariant notre/leur, so
// only the 3-element determiners inflect for gender. Known minor edge (as in the
// elision pass): a feminine *aspirated*-h noun (rare, e.g. «hache») is mis-agreed
// to «son hache»; the mute-h words this helps («son amie», «son heure») dominate.
function frenchPossessivePhrase(possessiveCid, nounCid) {
  const forms = vocab().languages?.fr?.forms;
  const arr = forms?.[possessiveCid];
  const nounForm = formOf("fr", nounCid);
  if (!Array.isArray(arr)) {
    // Unexpected shape — defer to the generic gender-agreement path.
    return `${genderedFormOf("fr", possessiveCid, nounCid)} ${nounForm}`;
  }
  if (arr.length >= 3) noteRule("french_possessive_agreement");
  let poss = arr[0]; // masculine, or the gender-invariant singular (notre/leur)
  if (arr.length >= 3 && forms?.[nounCid]?.gender === "f") {
    const vowelH = FR_VOWEL_H.includes((nounForm[0] || "").toLowerCase());
    poss = vowelH ? arr[0] : arr[1];
  }
  return `${poss} ${nounForm}`;
}

// `caseName` (uk): render the possessed noun in the case its governing
// preposition demands («з його мамою»), when the entry carries the data.
function nounWithPossessive(lang, possessiveCid, nounCid, caseName = null) {
  if (lang === "fr") return frenchPossessivePhrase(possessiveCid, nounCid);
  let noun = formOf(lang, nounCid);
  if (lang === "uk") {
    const declined = ukCaseForm(nounCid, caseName);
    if (declined) {
      noteRule("prepositional_case");
      noun = declined;
    }
  }
  const possessive = genderedFormOf(lang, possessiveCid, nounCid);
  // Thai postposes the possessor: โทรศัพท์ของคุณ ("phone of-you").
  if (lang === "th") {
    return `${noun}${possessive}`;
  }
  // Italian possessives take the definite article («il tuo telefono»,
  // «le tue scarpe») — except before singular family nouns («con sua figlia»).
  if (lang === "it") {
    const nounEntry = vocab().languages?.it?.forms?.[nounCid];
    if (!nounEntry?.noArticleWithPossessive) {
      if (nounEntry?.pluralOnly) {
        const pl = genderedFormOf(lang, possessiveCid, nounCid, true);
        return `${nounEntry.gender === "f" ? "le" : "i"} ${pl} ${noun}`;
      }
      return `${nounEntry?.gender === "f" ? "la" : "il"} ${possessive} ${noun}`;
    }
  }
  return `${possessive} ${noun}`;
}

// Languages where adjective follows the noun (e.g. "casa grande")
const POST_ADJECTIVE_LANGS = new Set(["pt", "ar", "it", "th"]);

// Languages that omit the present-tense copula. Ukrainian (and Russian-style
// Slavic) drop "to be" in the present ("Це телефон", not "Це є телефон"),
// Arabic nominal sentences carry no copula ("هذا هاتف"), and Turkish present-
// tense nominal sentences use a zero/suffix copula ("O bir öğrenci", not
// "O olur öğrenci" — olmak means "to become"). Other supported languages
// (en/es/pt/de/fr/el/no) keep an overt copula. Present tense only — these
// templates are all present tense.
const ZERO_PRESENT_COPULA = new Set(["uk", "ar", "tr"]);

function isCopulaConcept(cid) {
  return cid === "BE" ||
    vocab().concepts?.[cid]?.semantic_role === "copula";
}

function isAdjectiveConcept(cid) {
  return vocab().concepts?.[cid]?.type === "adjective";
}

// Chinese predicate adjectives take the degree adverb 很 instead of the copula
// 是 ("他很强", not "他是强"). 是 is still correct before a predicate noun
// ("他是学生"). Returns the surface to use in place of the copula for zh when
// the complement is a bare adjective, or null to fall through to copulaForm.
function zhCopulaOverride(lang, beCid, complementCid) {
  if (lang === "zh" && isCopulaConcept(beCid) && isAdjectiveConcept(complementCid)) {
    noteRule("zh_predicate_adjective");
    return "很";
  }
  return null;
}

// Thai splits the copula three ways: adjectives are stative verbs and take
// NO copula at all (เขาแข็งแรง — "he strong"), locations take อยู่
// (หนังสืออยู่บนนี้), and noun predicates take เป็น — or คือ after a
// demonstrative subject (นี่คือมือของฉัน). Returns the copula surface
// ("" = drop it) or null to fall through to copulaForm.
function thCopulaOverride(lang, beCid, complementCid, subjectCid) {
  if (lang !== "th" || !isCopulaConcept(beCid)) return null;
  const compMeta = vocab().concepts?.[complementCid];
  // A possessive is grammatically an adjective but heads a NOUN predicate
  // (นี่คือมือของฉัน) — fall through to the noun-predicate copulas.
  if (isAdjectiveConcept(complementCid) &&
      compMeta?.semantic_role !== "possessive") {
    noteRule("zero_copula");
    return "";
  }
  if (compMeta?.type === "position") {
    // A locative whose own form already carries อยู่ (OFF «ไม่ได้อยู่บน» —
    // the negated copula lives inside the phrase) absorbs the copula.
    if (formOf("th", complementCid).includes("อยู่")) return "";
    return "อยู่";
  }
  if (subjectCid === "THIS" || subjectCid === "THAT") {
    return "คือ";
  }
  return null; // noun predicate — เป็น via the normal path
}

// Combined copula override for languages with special copula behavior;
// null falls through to copulaForm.
function copulaOverride(lang, beCid, complementCid, subjectCid) {
  const th = thCopulaOverride(lang, beCid, complementCid, subjectCid);
  if (th !== null) return th;
  return zhCopulaOverride(lang, beCid, complementCid);
}

// Copula surface for a given language. Returns "" for languages that drop the
// present copula, so callers can omit the token; otherwise conjugates normally.
function copulaForm(lang, beCid, subjectCid) {
  if (ZERO_PRESENT_COPULA.has(lang) && isCopulaConcept(beCid)) {
    noteRule("zero_copula");
    return "";
  }
  return getVerbForm(beCid, subjectCid, lang);
}
// All others (en, ja, ko, no, uk, de, el, tr) place adjective before noun

// Numbers that take the kun-yomi generic counter つ in Japanese (ひとつ,
// ふたつ, …, ここのつ). For 10+, the bare number is linked with の or paired
// with the broader 個 counter; see jaQuantifierPrefix.
const JA_KUN_COUNTER_NUMBERS = new Set([
  "ONE", "TWO", "THREE", "FOUR", "FIVE",
  "SIX", "SEVEN", "EIGHT", "NINE",
]);

// Japanese quantifier rendering: numbers attach to nouns through a counter
// plus the linking particle の. ONE-NINE use the universal つ counter (二つ
// の食べ物 = "two foods"); TEN-FIFTEEN use 個 (十個の食べ物). Renders the
// "<number><counter>の" prefix to splice in front of the noun phrase.
function jaQuantifierPrefix(numberCid, numberWord) {
  noteRule("ja_counter");
  const counter = JA_KUN_COUNTER_NUMBERS.has(numberCid) ? "つ" : "個";
  return numberWord + counter + "の";
}

function adjectiveNounPhrase(lang, adjectiveCid, nounCid, opts = {}) {
  const adjective = (opts.plural && lang !== "en")
    ? genderedFormOf(lang, adjectiveCid, nounCid, true)
    : genderedFormOf(lang, adjectiveCid, nounCid, false);
  const bare = opts.plural
    ? (lang === "en" ? pluralize(formOf(lang, nounCid)) : pluralFormOf(lang, nounCid))
    : formOf(lang, nounCid);
  const withArticle = nounPhrase(lang, nounCid, opts);

  if (POST_ADJECTIVE_LANGS.has(lang)) {
    noteRule("post_nominal_adjective");
    return joinWords(lang, [withArticle, adjective]);
  }
  // Insert adjective between article and noun
  if (withArticle !== bare) {
    let article = withArticle.substring(0, withArticle.length - bare.length).trimEnd();
    // For English, the article must agree with the adjective (now the next word),
    // not the noun — "an old spell" not "a old spell".
    if (lang === "en" && /^an?$/i.test(article)) {
      article = englishIndefiniteArticle(adjective);
    }
    return `${article} ${adjective} ${bare}`;
  }
  return `${adjective} ${bare}`;
}
function buildCopularDemonstrative(lang, subjectCid, beCid, adjectiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const override = copulaOverride(lang, beCid, nounCid, subjectCid);
  const be = override !== null ? override : copulaForm(lang, beCid, subjectCid);
  const plural = isPluralPronoun(subjectCid);
  const complement = adjectiveNounPhrase(lang, adjectiveCid, nounCid, { plural });
  if (lang === "th") return joinWords(lang, [subject, be, complement]) + ".";
  return joinSentence([subject, be, complement]);
}

function buildYesNoQuestionCopular(lang, subjectCid, beCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const override = copulaOverride(lang, beCid, nounCid, subjectCid);
  const be = override !== null ? override : copulaForm(lang, beCid, subjectCid);
  const complement = nounWithPossessive(lang, possessiveCid, nounCid);

  // Thai keeps declarative order and asks with the tag particle ใช่ไหม —
  // no question mark (นั่นคือโทรศัพท์ของคุณใช่ไหม).
  if (lang === "th") {
    return joinWords(lang, [subject, be, complement]) + "ใช่ไหม";
  }
  // Copula-dropping languages form the yes/no question without "to be"
  // («Це твій телефон?»); pt/es keep declarative order and mark the question
  // with intonation («Esse é o seu telefone?»); the rest front the copula
  // ("Is this your phone?", "Ist das dein Telefon?").
  const words = (lang === "pt" || lang === "es")
    ? [subject, be, complement]
    : [be, subject, complement];
  return capitalizeFirst(words.filter(Boolean).join(" ") + "?");
}
function buildSubjectBeNounClause(lang, subjectCid, beCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const override = copulaOverride(lang, beCid, nounCid, subjectCid);
  const be = override !== null ? override : copulaForm(lang, beCid, subjectCid);
  // A predicate noun may carry a dedicated predicative form — uk HOME is
  // «удома» ("he is at home"), not the dictionary «дім» ("he is a house").
  const entry = vocab().languages?.[lang]?.forms?.[nounCid];
  const predicative = entry && !Array.isArray(entry) && typeof entry === "object"
    ? entry.predicative : null;
  const noun = predicative ||
    nounPhrase(lang, nounCid, { plural: isPluralPronoun(subjectCid) });
  // Thai predicative forms carry their own verb (อยู่บ้าน) — no copula.
  const beWord = (lang === "th" && predicative) ? "" : be;
  return joinWords(lang, [subject, beWord, noun]);
}

function buildSubjectVerbObjectWithPossessiveClause(lang, subjectCid, verbCid, objectCid, withCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const verb = getVerbForm(verbCid, subjectCid, lang);
  // Use nounPhrase (not bare formOf) so a direct object gets its indefinite
  // article where the language uses one ("casts a spell", "isst ein Brot")
  // or its object case where the language declines instead (uk «воду»);
  // mass/uncountable nouns ("learns magic") pass through unchanged.
  const object = nounPhrase(lang, objectCid, { directObject: true });
  // The "with his X" companion is optional: plain SVO templates omit these slots.
  // Only build it when a companion noun is present, so undefined slots don't leak
  // into the sentence as the literal word "undefined".
  const companion = nounCid
    ? joinWords(lang, [formOf(lang, withCid), nounWithPossessive(lang, possessiveCid, nounCid,
        lang === "uk" ? UK_PREP_CASE[withCid] : null)])
    : "";

  return joinWords(lang, [subject, verb, object, companion]);
}

function buildSubjectVerbWithPossessiveClause(lang, subjectCid, verbCid, withCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const verb = getVerbForm(verbCid, subjectCid, lang);
  const companion = nounCid
    ? joinWords(lang, [formOf(lang, withCid), nounWithPossessive(lang, possessiveCid, nounCid,
        lang === "uk" ? UK_PREP_CASE[withCid] : null)])
    : "";

  return joinWords(lang, [subject, verb, companion]);
}
function buildComplexClauseSentence(lang, linkerCid, subClause, mainClause, subordinateFirst = false) {
  const linker = formOf(lang, linkerCid);

  // Thai joins clauses without commas; the clause boundary is a space
  // (ถ้าเขาอยู่บ้าน เขากิน...) and a trailing linker attaches directly.
  if (lang === "th") {
    return subordinateFirst
      ? `${linker}${subClause} ${mainClause}`
      : `${mainClause}${linker}${subClause}`;
  }

  if (subordinateFirst) {
    return capitalizeFirst(`${linker} ${subClause}, ${mainClause}.`);
  }

  // Trailing subordinate clause: the MAIN clause leads ("He eats dinner
  // with his mom because he is home"), the linker + subordinate follow.
  return capitalizeFirst(`${mainClause} ${linker} ${subClause}.`);
}
// `sharedChoices` (optional) is a per-noun cache of randomly-injected
// modifiers, keyed by noun cid. When two languages render the same template
// (target + support pair), passing the same object to both calls keeps the
// chosen adjective / number in sync so the sentences match in content.
function buildSentence(lang, tpl, forcedConcept = null, sharedChoices = null) {
  return finalizeSentence(
    lang,
    buildSentenceRaw(lang, tpl, forcedConcept, sharedChoices)
  );
}

// Fixed-form structures whose grammar the generator cannot synthesize:
// questions need do-support («Why do you go?») or subject–verb inversion
// («Warum gehst du?»), directions need derived adverbials («на північ»,
// «nach Norden»), and politeness/modality/response/evaluation tags are fixed
// idioms with authored word order («Так, я роблю», «Це праворуч»). These
// templates carry no injectable noun slot in practice, so the human-authored
// render always describes exactly what would be shown — pass it through.
const AUTHORED_ONLY_STRUCTURES = new Set([
  "question", "direction", "selection", "response",
  "politeness", "modality", "evaluation",
  "time_statement", "time_relation",
]);

function buildSentenceRaw(lang, tpl, forcedConcept = null, sharedChoices = null) {
if (AUTHORED_ONLY_STRUCTURES.has(tpl.structure?.type)) {
  const authored = tpl.render?.[lang];
  if (typeof authored === "string" && authored.trim()) return authored.trim();
}
if (tpl.structure?.type === "copular_demonstrative") {
  const s = tpl.slots;
  return buildCopularDemonstrative(
    lang,
    s.subject,
    s.verb,
    s.adjective,
    s.noun
  );
}
if (tpl.structure?.type === "yes_no_question_copular") {
  const s = tpl.slots;
  return buildYesNoQuestionCopular(
    lang,
    s.subject,
    s.verb,
    s.possessive,
    s.noun
  );
}
if (tpl.structure?.type === "complex_clause") {
  const s = tpl.slots;

  const subClause = buildSubjectBeNounClause(
    lang,
    s.sub_subject,
    s.sub_verb,
    s.sub_noun
  );

  let mainClause;

  if (s.main_object) {
    mainClause = buildSubjectVerbObjectWithPossessiveClause(
      lang,
      s.main_subject,
      s.main_verb,
      s.main_object,
      s.main_prep,
      s.main_possessive,
      s.main_noun
    );
  } else {
    mainClause = buildSubjectVerbWithPossessiveClause(
      lang,
      s.main_subject,
      s.main_verb,
      s.main_prep,
      s.main_possessive,
      s.main_noun
    );
  }

  return buildComplexClauseSentence(
    lang,
    tpl.structure.linker,
    subClause,
    mainClause,
    tpl.structure.subordinate_first
  );
}
  const ordered = orderedConceptsForTemplate(tpl, lang);
  if (!ordered || !ordered.length) return "";

  const forcedMeta = forcedConcept
    ? vocab().concepts[forcedConcept]
    : null;

  const isCopularTemplate = ordered.some(c =>
    c === "BE" || vocab().concepts[c]?.semantic_role === "copula"
  );

  // The subject is normally a pronoun. Copular templates ("autumn is old",
  // "the book is red", "night is dark") often have a noun — or time-word —
  // subject instead; without it the copula has no subject and English
  // renders the bare infinitive ("Be autumn old") rather than "is", and the
  // predicate adjective has nothing to agree with («ніч темна»). Relational
  // templates ("the shoes are under this") lead with their head noun — the
  // trailing demonstrative is a landmark, not the subject, and must not
  // steal copula agreement ("the shoes IS under this").
  const relationalHead =
    RELATIONAL_STRUCTURES.has(tpl.structure?.type) &&
    ["noun", "time"].includes(vocab().concepts[ordered[0]]?.type)
      ? ordered[0] : null;
  const subjectCid = relationalHead ||
    ordered.find(c => vocab().concepts[c]?.type === "pronoun") ||
    (isCopularTemplate
      ? ordered.find(c => ["noun", "time"].includes(vocab().concepts[c]?.type))
      : undefined);

  // For copular templates (subject + BE + predicate-noun), the predicate
  // noun must agree with the subject in number. We treat any template that
  // uses the BE verb as copular and pluralise its predicate noun(s) when
  // the subject pronoun is plural. Non-copular SVO ("they have a book")
  // intentionally keeps the singular object.
  const subjectIsPluralPronoun = isPluralPronoun(subjectCid);
  const pluralAgreement = subjectIsPluralPronoun && isCopularTemplate;

  // Which case (if any) governs each position — uk prepositional case.
  const caseAt = ukCaseMap(lang, ordered);

  const words = ordered.map((cid, idx) => {
    const meta = vocab().concepts[cid];
    if (!meta) return cid;

    if (meta.type === "verb") {
      // Control-verb chains (start/stop/want/like + verb) need the second
      // verb in its non-finite form: English "they start SLEEPING",
      // Portuguese "eles começam A DORMIR", Ukrainian "вони починають
      // СПАТИ". When a verb is preceded by another verb in the template's
      // ordering, prefer the per-language surface override (which can carry
      // the right gerund/infinitive plus any linking preposition); fall
      // back to the base/infinitive form so languages without an explicit
      // override still avoid the bug of conjugating the complement.
      const prevIsVerb = idx > 0 &&
        vocab().concepts[ordered[idx - 1]]?.type === "verb";
      if (prevIsVerb) {
        const surfaceOverride = tpl.surface?.[lang]?.[cid];
        if (surfaceOverride) return surfaceOverride;
        const entry = vocab().languages?.[lang]?.forms?.[cid];
        if (entry && typeof entry === "object" && typeof entry.base === "string") {
          return entry.base;
        }
        return formOf(lang, cid);
      }
      // Copula in a present-tense statement: dropped entirely in
      // copula-less languages (uk/ar), replaced by 很 before a Chinese
      // predicate adjective, split three ways in Thai (zero/อยู่/คือ),
      // conjugated everywhere else.
      if (isCopulaConcept(cid)) {
        const override = copulaOverride(lang, cid, ordered[idx + 1], subjectCid);
        return override !== null ? override : copulaForm(lang, cid, subjectCid);
      }
      return getVerbForm(cid, subjectCid, lang);
    }

    if (meta.type === "noun") {

  // A preposition-governed nominal renders in its declined case form when
  // the data provides one («перед книгою», «до будинку»). Case data is
  // authored for the exact templates that need it; modifier injection is
  // skipped here — an injected adjective could not agree with an oblique
  // case anyway.
  const governedForm = ukCaseForm(cid, caseAt[idx]);
  if (governedForm) {
    noteRule("prepositional_case");
    return governedForm;
  }

  // A described noun subject — and the landmark noun after a spatial
  // preposition — take the definite article ("The book is next to the
  // phone", «O livro está ao lado do telefone»); the indefinite reading is
  // wrong there in every article language. Predicate nouns after a personal
  // pronoun stay indefinite ("she is A woman").
  const afterPosition = idx > 0 &&
    vocab().concepts[ordered[idx - 1]]?.type === "position";
  const subjectIsPersonal = !!vocab().concepts[subjectCid]?.person;
  if (DEFINITE_SUBJECT_STRUCTURES.has(effectiveStructureType(tpl)) &&
      (afterPosition || (cid === subjectCid && !subjectIsPersonal))) {
    return definiteNounPhrase(lang, cid);
  }

  // A noun singled out by a limiting quantifier is definite: "I read only
  // THE book", «leggo solo il libro» — the indefinite reading contradicts
  // the exclusivity ONLY asserts. Article languages only: case languages
  // handle the same noun through their case logic below.
  if (ARTICLE_LANGS.has(lang) &&
      prevMetaEarly(ordered, idx)?.semantic_role === "quantity_limit") {
    return definiteNounPhrase(lang, cid);
  }

  // Italian prepositional objects take the definite article — the
  // contraction pass then fuses them («a la casa» → «alla casa»). Nouns
  // flagged noArticle stay bare («a mano», «a casa»).
  if (lang === "it" && idx > 0 &&
      vocab().concepts[ordered[idx - 1]]?.type === "glue" &&
      !vocab().languages?.it?.forms?.[cid]?.noArticle) {
    return definiteNounPhrase(lang, cid);
  }

  // If the template itself has a possessive directly before this noun, suppress the article.
  const precededByPossessive = idx > 0 &&
    vocab().concepts[ordered[idx - 1]]?.semantic_role === "possessive";
  // An attributive adjective, number, or determiner-like quantifier directly
  // before the noun replaces the article the same way a possessive does
  // ("another book" — not "another a book"). Adverb-like quantifiers (ONLY,
  // quantity_limit) do NOT absorb the article ("only a book"), so they are
  // excluded.
  const prevMeta = idx > 0 ? vocab().concepts[ordered[idx - 1]] : null;
  const precededByModifier = !!prevMeta && ordered[idx - 1] !== subjectCid &&
    ((prevMeta.type === "adjective" && prevMeta.semantic_role !== "possessive") ||
     prevMeta.type === "number" ||
     (prevMeta.type === "quantifier" && prevMeta.semantic_role !== "quantity_limit"));
  // Direct objects take the object case in declining languages (uk
  // accusative). Possessed objects only shift for the regular feminine
  // rule — an explicit animate-masculine override would clash with the
  // possessive word, which has no accusative data of its own.
  const isObject = isDirectObjectPosition(ordered, idx);
  const ukObjectCase = lang === "uk" && isObject && !pluralAgreement;
  // Copular agreement: this noun is the predicate after a plural subject.
  // Possessed nouns (their/our + noun) follow the possessive's own number,
  // not the subject's, so skip them.
  const bareDetermined = precededByPossessive || precededByModifier;
  const useCopularPlural = pluralAgreement && !bareDetermined;
  let possessedForm = formOf(lang, cid);
  if (ukObjectCase && bareDetermined &&
      vocab().languages?.uk?.forms?.[cid]?.gender === "f") {
    const acc = ukFeminineAccusative(possessedForm);
    if (acc !== possessedForm) {
      noteRule("accusative_object");
      possessedForm = acc;
    }
  }
  // Thai possessors follow the noun: มือของฉัน ("hand of-me") — the
  // possessive word (ของฉัน) attaches after the possessed noun, and its
  // own ordered-walk slot renders empty. "Another" postposes with the
  // classifier: หนังสืออีกเล่ม.
  if (lang === "th" && precededByPossessive) {
    return possessedForm + formOf(lang, ordered[idx - 1]);
  }
  if (lang === "th" && precededByModifier &&
      prevMeta?.semantic_role === "quantity_additional") {
    const clf = vocab().languages?.th?.forms?.[cid]?.classifier || "อัน";
    return possessedForm + formOf(lang, ordered[idx - 1]) + clf;
  }
  let phrase = bareDetermined
    ? possessedForm
    : nounPhrase(lang, cid, { plural: useCopularPlural, directObject: isObject });
  // When the noun was rendered as plural via copular agreement, the bare
  // form used by the modifier branches below also needs to be plural so
  // adjective insertion produces "small leaders" not "small leader".
  let bareNoun = useCopularPlural
    ? (lang === "en" ? pluralize(formOf(lang, cid)) : pluralFormOf(lang, cid))
    : null;

  let adjectiveWord = null;
  let adjectiveCid = null;
  let numberWord = null;
  let numberCid = null;

  // adjective
  const cachedAdj = sharedChoices && Object.prototype.hasOwnProperty.call(sharedChoices, "adj_" + cid)
    ? sharedChoices["adj_" + cid]
    : undefined;
  if (forcedMeta?.type === "adjective") {
    adjectiveCid = forcedConcept;
    adjectiveWord = genderedFormOf(lang, forcedConcept, cid);
  } else if (cachedAdj !== undefined) {
    adjectiveCid = cachedAdj;
    adjectiveWord = cachedAdj ? genderedFormOf(lang, cachedAdj, cid) : null;
  } else {
    const adjectives = getReleased().filter(c => {
      const m = vocab().concepts[c];
      if (m?.type !== "adjective") return false;
      if (m?.semantic_role === "possessive") return false; // possessives must not be randomly injected as modifiers
      const st = ensureProgress(c);
      if (st.completed || st.level < 4) return false;
      // Only pair adjectives with nouns they make sense with — no
      // "shiny food" / "wild book" / "big water" style mismatches.
      return isModifierCompatible(lang, c, cid);
    });

    if (adjectives.length && rng() < 0.75) {
      const adj = adjectives[Math.floor(rng() * adjectives.length)];
      adjectiveCid = adj;
      adjectiveWord = genderedFormOf(lang, adj, cid);
    }
    if (sharedChoices) sharedChoices["adj_" + cid] = adjectiveCid;
  }

  // number
  const cachedNum = sharedChoices && Object.prototype.hasOwnProperty.call(sharedChoices, "num_" + cid)
    ? sharedChoices["num_" + cid]
    : undefined;
  if (forcedMeta?.type === "number") {
    numberCid = forcedConcept;
    numberWord = formOf(lang, forcedConcept);
  } else if (cachedNum !== undefined) {
    numberCid = cachedNum;
    numberWord = cachedNum ? formOf(lang, cachedNum) : null;
  } else {
    // Random number injection for variety. Skips ONE (redundant with the
    // indefinite article) and restricts to numbers the learner has actually
    // started working on (L4+, not yet completed). Also skipped for mass
    // nouns ("two water" / "three food" don't work) via compatibility check.
    //
    // Two extra guards prevent broken sentences:
    //   1. Never pluralise the noun being filled in for an L3 blank — the
    //      blank-matching step looks up the singular surface, so a plural
    //      injection ("жінки" vs "жінка") would silently drop the blank.
    //   2. In a copular template with a singular subject, "She is two new
    //      women" is never valid; suppress plural injection there.
    const isTargetNoun = forcedConcept === cid;
    const subjectIsSingularPronoun = subjectCid && !subjectIsPluralPronoun;
    const skipPluralInjection = isTargetNoun ||
      (isCopularTemplate && subjectIsSingularPronoun);
    const numbers = skipPluralInjection ? [] : getReleased().filter(c => {
      if (c === "ONE") return false;
      const m = vocab().concepts[c];
      if (m?.type !== "number") return false;
      const st = ensureProgress(c);
      if (st.completed || st.level < 4) return false;
      return isModifierCompatible(lang, c, cid);
    });
    if (numbers.length && rng() < 0.15) {
      const n = numbers[Math.floor(rng() * numbers.length)];
      numberCid = n;
      numberWord = formOf(lang, n);
    }
    if (sharedChoices) sharedChoices["num_" + cid] = numberCid;
  }

  // The template's authored surface knows inflections the engine cannot
  // derive («додому», "eve"). For a plain noun (no injected modifier) whose
  // authored surface differs from the dictionary form, the authored surface
  // IS the correct rendering. In article languages surfaces are stored bare
  // ("Arbeit", not "eine Arbeit"), so preferring a different lexeme would
  // silently drop the article — only surfaces that visibly extend the
  // dictionary form («a casa» ⊃ «casa») are safe to prefer there.
  if (!adjectiveWord && !numberWord && !useCopularPlural) {
    const authoredNounSurface = tpl.surface?.[lang]?.[cid];
    if (typeof authoredNounSurface === "string" &&
        authoredNounSurface !== formOf(lang, cid) &&
        (!ARTICLE_LANGS.has(lang) || authoredNounSurface.includes(formOf(lang, cid)))) {
      return authoredNounSurface;
    }
  }

  // apply modifiers
  // When copular plural agreement applies, the bare form used by the
  // adjective branches must also be plural ("they are small leaders").
  if (adjectiveWord || numberWord) noteModifier();
  // The bare form must match the case actually rendered in `phrase`, or the
  // article/adjective splicing below misassembles the noun phrase.
  const bare = bareNoun ||
    (ukObjectCase && !bareDetermined ? ukAccusativeNoun(cid, formOf(lang, cid)) :
     ukObjectCase ? possessedForm :
     formOf(lang, cid));
  const POST_ADJ = POST_ADJECTIVE_LANGS.has(lang);
  // An adjective on a feminine accusative object agrees in case too:
  // «я п'ю холодну воду», not «холодна воду». Ukrainian feminine adjectives
  // end in -а/-я like the nouns, so the same ending shift applies.
  const ukShiftAdj = ukObjectCase && !useCopularPlural &&
    vocab().languages?.uk?.forms?.[cid]?.gender === "f";
  if (ukShiftAdj && adjectiveWord) adjectiveWord = ukFeminineAccusative(adjectiveWord);

  if (numberWord) {
    // Same surface capture for a forced number modifier (see adjective note).
    if (sharedChoices && numberCid === forcedConcept) {
      const k = "blankSurface_" + lang;
      if (!(k in sharedChoices)) sharedChoices[k] = numberWord;
    }
    // Numbers replace the article: "two books" not "two a book"
    const isPlural = numberCid !== "ONE";
    let nounForm;
    if (!isPlural) {
      nounForm = bare;
    } else if (lang === "en") {
      const enEntry = vocab().languages?.en?.forms?.[cid] || {};
      nounForm = (enEntry.invariantPlural || enEntry.pluralOnly) ? bare : pluralize(bare);
    } else {
      nounForm = pluralFormOf(lang, cid);
    }
    // Thai counts with a classifier AFTER the number, and the whole
    // quantifier follows the noun: หนังสือสองเล่ม ("book two CLF").
    if (lang === "th") {
      // Adjective precedes the quantifier: หนังสือดีสามเล่ม ("book good
      // three CLF").
      const clf = vocab().languages?.th?.forms?.[cid]?.classifier || "อัน";
      return joinWords(lang, [nounForm, adjectiveWord, numberWord, clf]);
    }
    // Japanese requires a counter when a number quantifies a noun. Render as
    // "<number><counter>の<noun>" so "二 食べ物" becomes "二つの食べ物"
    // ("two foods"). Adjectives sit between の and the noun, matching the
    // natural JA order ("二つの新しい食べ物").
    if (lang === "ja") {
      const prefix = jaQuantifierPrefix(numberCid, numberWord);
      return adjectiveWord
        ? prefix + adjectiveWord + nounForm
        : prefix + nounForm;
    }
    if (adjectiveWord) {
      const adjForm = (isPlural && adjectiveCid && lang !== "en")
        ? genderedFormOf(lang, adjectiveCid, cid, true)
        : adjectiveWord;
      return POST_ADJ
        ? numberWord + " " + nounForm + " " + adjForm
        : numberWord + " " + adjForm + " " + nounForm;
    }
    return numberWord + " " + nounForm;
  }

  if (adjectiveWord) {
    const adjectiveIsPossessive =
      vocab().concepts[adjectiveCid]?.semantic_role === "possessive";
    // Non-English languages typically inflect the adjective for number too.
    const adjForm = (useCopularPlural && lang !== "en" && !adjectiveIsPossessive)
      ? genderedFormOf(lang, adjectiveCid, cid, true)
      : adjectiveWord;
    // Record the exact surface rendered for a forced modifier so the L3
    // "fill in the missing word" blank can match the inflected form actually
    // shown (e.g. uk «темна»), not the base form returned by formOf. Keyed by
    // language so target/support builds don't clobber each other; first wins.
    if (sharedChoices && adjectiveCid === forcedConcept) {
      const k = "blankSurface_" + lang;
      if (!(k in sharedChoices)) sharedChoices[k] = adjForm;
    }
    if (adjectiveIsPossessive) {
      // Possessives replace the article entirely: "her wizard" not "a her wizard"
      phrase = joinWords(lang, [adjForm, bare]);
    } else if (POST_ADJ) {
      // Article + noun + adjective: "uma casa grande" (spaceless in th)
      phrase = joinWords(lang, [phrase, adjForm]);
    } else if (phrase !== bare) {
      // Has article — insert adjective between: "a big house"
      let article = phrase.substring(0, phrase.length - bare.length).trimEnd();
      // For English, recompute article against the adjective (next word after article).
      if (lang === "en" && /^an?$/i.test(article)) {
        article = englishIndefiniteArticle(adjForm);
      }
      phrase = article + " " + adjForm + " " + bare;
    } else {
      // No article: "big water"
      phrase = adjForm + " " + bare;
    }
  }

  return phrase;
}

    // English demonstrative pronouns read awkwardly as bare prepositional
    // objects — "the phone is in that" / "a red phone is in that". English
    // wants a head noun there, so render the demonstrative as "that one" /
    // "this one" when it directly follows a positional preposition (in/on/
    // under/off/…). Other languages take a standalone demonstrative naturally
    // (e.g. uk «у тому», de «in jenem»), so this is English-only and keyed off
    // the preceding concept being a position word.
    if (lang === "en" && (cid === "THIS" || cid === "THAT")) {
      const prevCid = ordered[idx - 1];
      if (vocab().concepts[prevCid]?.type === "position") {
        return formOf(lang, cid) + " one";
      }
    }

    // Time-word subjects are described definites too: "The night is dark",
    // «O dia é curto». (Time words are their own concept type, so the noun
    // branch above never sees them.)
    if (meta.type === "time" && cid === subjectCid &&
        DEFINITE_SUBJECT_STRUCTURES.has(effectiveStructureType(tpl))) {
      return definiteNounPhrase(lang, cid);
    }

    // Ukrainian expresses means with the bare instrumental — the case ending
    // IS the "by" («роблю це рукою», not «за допомогою руки»). Drop the BY
    // word whenever the following nominal can carry the instrumental itself.
    if (lang === "uk" && cid === "BY" &&
        ukCaseForm(ordered[idx + 1], "instrumental")) {
      return "";
    }

    // A preposition-governed pronoun/demonstrative declines like a governed
    // noun («на цьому», «між цим і тим») when case data exists.
    if (meta.type === "pronoun") {
      const governed = ukCaseForm(cid, caseAt[idx]);
      if (governed) {
        noteRule("prepositional_case");
        return governed;
      }
      // Thai demonstratives have a bound form after a preposition:
      // standalone นี่ ("this") but บนนี้ ("on this"), surviving a
      // conjunction (ระหว่างนี้และนั้น) — carried in the data. A direct-
      // object demonstrative takes its full form (ทำสิ่งนี้).
      if (lang === "th") {
        const e = vocab().languages?.th?.forms?.[cid];
        if (e && !Array.isArray(e) && typeof e === "object") {
          let j = idx - 1;
          while (j >= 0 &&
                 ["connector", "pronoun"].includes(vocab().concepts[ordered[j]]?.type)) j--;
          if (vocab().concepts[ordered[j]]?.type === "position" &&
              typeof e.governed === "string") {
            return e.governed;
          }
          if (typeof e.objectForm === "string" &&
              isDirectObjectPosition(ordered, idx)) {
            return e.objectForm;
          }
        }
      }
    }

    // A demonstrative subject agrees with the predicate noun's gender where
    // the language declines it («Esta es mi mano», «Este é um bom livro»).
    // Data-driven: only fires when the demonstrative entry carries gendered
    // forms, so uk «це» / en "this" are untouched.
    if (idx === 0 && meta.type === "pronoun" && isCopularTemplate) {
      const predNoun = ordered.find(c => vocab().concepts[c]?.type === "noun");
      const entry = vocab().languages?.[lang]?.forms?.[cid];
      if (predNoun && entry && !Array.isArray(entry) &&
          typeof entry === "object" && (entry.f || entry.n)) {
        return genderedFormOf(lang, cid, predNoun);
      }
    }

    // Predicate adjective in a copular sentence ("autumn is OLD") must agree
    // with the subject noun in gender — "осінь стара", not "осінь старий" —
    // and in number for plural-only subjects («штани чорні», "as calças são
    // pretas"). surfaceForm would return the bare (masculine singular) form.
    // Restricted to noun subjects, since a pronoun carries no usable
    // grammatical gender.
    if (meta.type === "adjective" && meta.semantic_role !== "possessive" &&
        isCopularTemplate &&
        ["noun", "time"].includes(vocab().concepts[subjectCid]?.type)) {
      const subjEntry = vocab().languages?.[lang]?.forms?.[subjectCid];
      const subjPlural = !!(subjEntry && typeof subjEntry === "object" &&
        !Array.isArray(subjEntry) && subjEntry.pluralOnly);
      return genderedFormOf(lang, cid, subjectCid, subjPlural);
    }

    // An attributive adjective/quantifier directly before a noun agrees with
    // it («іншу книгу», "outra casa") — data-driven via gendered forms, and
    // shifted to the accusative alongside a feminine uk direct object.
    if ((meta.type === "quantifier" ||
         (meta.type === "adjective" && meta.semantic_role !== "possessive")) &&
        vocab().concepts[ordered[idx + 1]]?.type === "noun") {
      const nextCid = ordered[idx + 1];
      let form = genderedFormOf(lang, cid, nextCid);
      if (lang === "uk" && isDirectObjectPosition(ordered, idx + 1) &&
          !pluralAgreement &&
          vocab().languages?.uk?.forms?.[nextCid]?.gender === "f") {
        form = ukFeminineAccusative(form);
      }
      // Thai postposes "another" with the classifier: หนังสืออีกเล่ม
      // ("book more CLF") — rendered inside the noun slot, so this one
      // stays empty.
      if (lang === "th" && meta.semantic_role === "quantity_additional") {
        return "";
      }
      // Italian keeps the indefinite article before a determiner-like
      // quantifier: «un altro libro», «un'altra casa».
      if (lang === "it" && meta.semantic_role === "quantity_additional") {
        const g = vocab().languages?.it?.forms?.[nextCid]?.gender;
        form = g === "f" && IT_VOWEL_INITIAL.test(form) ? "un'" + form
          : (g === "f" ? "una " : "un ") + form;
      }
      return form;
    }

    // A possessive directly before a noun agrees with that noun's gender
    // («моя мама», "minha casa") — surfaceForm alone returns the base
    // (masculine) form. French is excluded: its vowel-initial rule (mon amie)
    // is handled by frenchPossessivePhrase, not by plain gender agreement.
    // When the possessed noun is a feminine direct object in Ukrainian, the
    // possessive shifts to the accusative with it («я маю мою книгу»).
    if (meta.type === "adjective" && meta.semantic_role === "possessive" &&
        lang !== "fr") {
      const nextCid = ordered[idx + 1];
      // Thai renders the possessor inside the noun slot (มือของฉัน) —
      // this slot stays empty.
      if (lang === "th" && vocab().concepts[nextCid]?.type === "noun") {
        return "";
      }
      if (vocab().concepts[nextCid]?.type === "noun") {
        let form = genderedFormOf(lang, cid, nextCid);
        if (lang === "uk" && isDirectObjectPosition(ordered, idx + 1) &&
            !pluralAgreement &&
            vocab().languages?.uk?.forms?.[nextCid]?.gender === "f") {
          form = ukFeminineAccusative(form);
        }
        // Italian possessives take the definite article («la mia mano»,
        // «il tuo telefono», «le mie scarpe») — except before singular
        // family nouns («con sua figlia»), flagged in the data.
        if (lang === "it") {
          const nounEntry = vocab().languages?.it?.forms?.[nextCid];
          if (!nounEntry?.noArticleWithPossessive) {
            if (nounEntry?.pluralOnly) {
              form = (nounEntry.gender === "f" ? "le " : "i ") +
                genderedFormOf(lang, cid, nextCid, true);
            } else {
              form = (nounEntry?.gender === "f" ? "la " : "il ") + form;
            }
          }
        }
        return form;
      }
    }

    return surfaceForm(lang, cid);
  });

  if (lang === "ja") {
    const wordsWithParticles = [...words];

    const pronounIndex = ordered.findIndex(c =>
      vocab().concepts[c]?.type === "pronoun"
    );

    // Insert in reverse index order so earlier splices don't shift later indices
    const insertions = [];
    if (pronounIndex !== -1) insertions.push({ idx: pronounIndex + 1, particle: "は" });
    // Copular templates ("X is Y") never take を — the predicate noun sits
    // directly before the copula です/だ. Inserting を produces ungrammatical
    // strings like "彼らは隣人をです". Non-copular SVO templates ("X eats Y")
    // still get を after the direct-object noun.
    if (!isCopularTemplate) {
      const nounIndex = ordered.findIndex(c =>
        vocab().concepts[c]?.type === "noun"
      );
      if (nounIndex !== -1) insertions.push({ idx: nounIndex + 1, particle: "を" });
    }
    insertions.sort((a, b) => b.idx - a.idx);
    for (const ins of insertions) {
      wordsWithParticles.splice(ins.idx, 0, ins.particle);
    }

    return wordsWithParticles.join("");
  }

  let sentence = joinWords(lang, words.filter(w => w !== "" && w != null));
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return sentence + ".";
}




export {
  formOf,
  englishIndefiniteArticle,
  PLURAL_EXCEPTIONS,
  pluralize,
  copularGenderClash,
  templateGenderClash,
  pluralFormOf,
  genderedFormOf,
  isPluralPronoun,
  nounPhrase,
  surfaceForm,
  getVerbForm,
  shuffle,
  safe,
  resolvePrompt,
  RELATIONAL_STRUCTURES,
  orderedConceptsForTemplate,
  blankSentence,
  safeSurfaceForConcept,
  isDirectObjectPosition,
  ukFeminineAccusative,
  ukAccusativeNoun,
  isModifierConcept,
  BROAD_SOURCE_FILES,
  ADJECTIVE_ROLE_COMPAT,
  ADJECTIVE_ROLE_BLOCK,
  adjectiveRoleAllowsNoun,
  adjectiveSuitsNoun,
  isModifierCompatible,
  buildSameTypeOptions,
  capitalizeFirst,
  joinSentence,
  frenchElision,
  finalizeSentence,
  possessiveWord,
  FR_VOWEL_H,
  frenchPossessivePhrase,
  nounWithPossessive,
  POST_ADJECTIVE_LANGS,
  ZERO_PRESENT_COPULA,
  isCopulaConcept,
  isAdjectiveConcept,
  zhCopulaOverride,
  copulaForm,
  JA_KUN_COUNTER_NUMBERS,
  jaQuantifierPrefix,
  adjectiveNounPhrase,
  buildCopularDemonstrative,
  buildYesNoQuestionCopular,
  buildSubjectBeNounClause,
  buildSubjectVerbObjectWithPossessiveClause,
  buildSubjectVerbWithPossessiveClause,
  buildComplexClauseSentence,
  buildSentence,
  buildSentenceRaw,
  buildSentenceWithRules
};
