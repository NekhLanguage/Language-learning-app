// sentence_engine.mjs
// Sentence-generation core extracted from app.js so it can be shared by the
// browser app AND offline validators/tests (validation/validate-sentences.mjs).
// Kept as an explicit ES module (.mjs) so Node treats it as ESM on every
// version (Node < 22 would otherwise parse a bare .js as CommonJS and fail the
// named imports), while the browser loads it via app.js's `import`.
// The browser configures live accessors; the validator injects a full vocab
// snapshot + a seeded RNG for deterministic, reproducible runs.

import { langRule, langsWith, langRuleValue } from "./language_rules.mjs";

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
  "genitive_possessor",      // tr possessor takes the genitive case (benim, bizim, onun)
  "have_existential",        // tr HAVE = genitive-possessor + possessed-noun + var
  "predicate_instrumental",  // pl predicate nouns after być take the instrumental
  "numeral_government",      // pl numbers five+ govern the genitive plural
];

let firedRules = null;
let tracedModifier = false;
let tracedModifierIds = null;
function noteRule(id) {
  if (firedRules) firedRules.add(id);
}
// Marks the traced build as carrying an adjective/number modifier — the
// sentence then differs from the plain template, so authored render strings
// no longer describe it. Records WHICH modifier landed on WHICH noun, so
// fences can compare identity across the target/support pair, not just a
// boolean (a modifier landing on noun A in one build and noun B in the
// other passed the boolean check).
function noteModifier(nounCid = null, adjCid = null, numCid = null) {
  if (firedRules) {
    tracedModifier = true;
    if (tracedModifierIds) {
      if (adjCid) tracedModifierIds.push("adj:" + adjCid + ">" + nounCid);
      if (numCid) tracedModifierIds.push("num:" + numCid + ">" + nounCid);
    }
  }
}

// Like buildSentence, but also reports which grammar rules fired while
// building and whether a modifier made the sentence diverge from the plain
// template — { sentence, rules, hadModifier }.
// Grading-variant support (language_rules: flexibleAdjectiveOrder). When
// set to "pre", the adjective splice renders pre-nominally in languages
// declaring the rule — used ONLY to derive accepted answers for the free-
// translation grader; the taught form stays the language's default order.
let _adjectiveOrderOverride = null;
function adjectivePreOrder(lang) {
  return _adjectiveOrderOverride === "pre" && langRule(lang, "flexibleAdjectiveOrder");
}

// Strip the template's subject pronoun off the front of a rendered
// sentence («Noi leggiamo un libro» → «Leggiamo un libro»). Returns null
// when the sentence doesn't start with that pronoun. Pure string surgery
// on the engine's own render, so it can never invent a form the engine
// didn't produce.
function dropSubjectPronoun(lang, tpl, sentence) {
  const pronounCid = (tpl.concepts || []).find(
    (c) => vocab().concepts[c]?.type === "pronoun",
  );
  if (!pronounCid || !sentence) return null;
  const word = formOf(lang, pronounCid);
  if (!word || typeof sentence !== "string") return null;
  if (!sentence.toLowerCase().startsWith(word.toLowerCase() + " ")) return null;
  const rest = sentence.slice(word.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// Every answer the free-translation grader should accept for this build.
// Always contains the taught sentence itself; per language_rules it adds
//   - the pre-nominal adjective order (flexibleAdjectiveOrder: «Tu leggi
//     un vecchio libro» alongside «Tu leggi un libro vecchio»), rendered
//     through the SAME engine path so agreement/articles stay right;
//   - the pronoun-dropped form of each variant (proDrop: «Leggiamo un
//     libro» — standard Italian/Spanish/Portuguese; rejecting it teaches
//     the learner that natural speech is wrong).
// Dan ruling 2026-08-27: grader accepts these, generator keeps teaching
// the explicit-pronoun, default-order form.
function acceptedAnswerVariants(lang, tpl, targetSentence, sharedChoices = null) {
  const variants = new Set();
  if (targetSentence) variants.add(targetSentence);
  if (langRule(lang, "flexibleAdjectiveOrder") && sharedChoices) {
    _adjectiveOrderOverride = "pre";
    try {
      const v = buildSentence(lang, tpl, null, sharedChoices);
      if (v) variants.add(v);
    } finally {
      _adjectiveOrderOverride = null;
    }
  }
  if (langRule(lang, "proDrop")) {
    for (const s of [...variants]) {
      const dropped = dropSubjectPronoun(lang, tpl, s);
      if (dropped) variants.add(dropped);
    }
  }
  return [...variants];
}

// Resolve what an L3 fill-in-the-blank should blank for `targetConcept`
// inside `sentence`, honouring the blank contract: the frame and the
// option tiles must partition the sentence exactly — the article lives on
// exactly one side. Nouns first try their full rendered phrase (article
// included: blanking «un aeroporto» out of «Loro vedono un aeroporto»
// leaves the frame article-free, and the articled option completes it).
// Where the noun renders bare — possessives, template numbers, mass nouns,
// contracted prepositional articles («alla stazione») — the bare form is
// blanked instead and `bareMode` tells the caller to render bare option
// tiles, so the learner never assembles «un un aeroporto» again.
function resolveNounBlank(sentence, tpl, targetLang, targetConcept) {
  const meta = vocab().concepts[targetConcept];
  const base = safeSurfaceForConcept(tpl, targetLang, targetConcept);
  const slot = slotContextFor(tpl, targetLang, targetConcept);
  if (meta?.type === "noun") {
    // A case-governed slot blanks the declined word — the slot-aware base
    // — never the citation phrase (whose stem would only match inside the
    // inflected form; the boundary guard in blankSentence now rejects
    // that, but trying the citation first would still lose the article-
    // free contract for declining languages). Article-language slots keep
    // trying the full articled phrase first so the article rides the tile.
    const phrase = nounPhrase(targetLang, targetConcept);
    if (!slot.caseName && phrase && phrase !== base) {
      const blanked = blankSentence(sentence, phrase, targetLang);
      if (blanked.includes("_____")) {
        return { blanked, surface: phrase, bareMode: false, slot };
      }
    }
  }
  const blanked = blankSentence(sentence, base, targetLang);
  if (blanked.includes("_____")) {
    return { blanked, surface: base, bareMode: meta?.type === "noun", slot };
  }
  return null;
}

function buildSentenceWithRules(lang, tpl, forcedConcept = null, sharedChoices = null) {
  firedRules = new Set();
  tracedModifier = false;
  tracedModifierIds = [];
  try {
    const sentence = buildSentence(lang, tpl, forcedConcept, sharedChoices);
    return {
      sentence,
      rules: [...firedRules],
      hadModifier: tracedModifier,
      // Sorted "kind:modifier>noun" keys — deep-equal across a
      // target/support pair means the same modifiers landed on the same
      // nouns in both builds.
      modifierKeys: [...tracedModifierIds].sort(),
    };
  } finally {
    firedRules = null;
    tracedModifier = false;
    tracedModifierIds = null;
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
function genderedFormOf(lang, modifierCid, nounCid, plural = false, genderOverride = null) {
  const mod = vocab().languages?.[lang]?.forms?.[modifierCid];
  if (!mod || typeof mod !== "object" || Array.isArray(mod)) {
    return plural ? pluralFormOf(lang, modifierCid) : formOf(lang, modifierCid);
  }
  const noun = vocab().languages?.[lang]?.forms?.[nounCid];
  const g = genderOverride || noun?.gender;
  if (plural) {
    // Virile split (language_rules: virilePlural — Polish): a plural
    // agreeing with a masculine-personal noun takes the vp form («nowi
    // studenci»); everything else takes the ordinary plural («nowe
    // telefony/kobiety»). Nouns flag `virile: true` in the data.
    if (langRule(lang, "virilePlural") && noun?.virile && mod.vp) {
      noteRule("gender_agreement"); return mod.vp;
    }
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

// Polish regular feminine accusatives: noun -a→-ę («kobieta»→«kobietę»),
// adjective -a→-ą («nowa»→«nową»). Single-word forms only — a multi-word
// Polish noun form must author its `accusative` field explicitly, because
// the noun and adjective endings differ (unlike uk, where one shift covers
// both words of «бігова доріжка»).
function plFeminineAccusativeNoun(form) {
  const w = String(form);
  return w.includes(" ") ? w : (w.endsWith("a") ? w.slice(0, -1) + "ę" : w);
}
function plFeminineAccusativeAdjective(form) {
  const w = String(form);
  return w.includes(" ") ? w : (w.endsWith("a") ? w.slice(0, -1) + "ą" : w);
}

// Feminine-accusative fallback strategies, selected by the language's
// declared caseMarking.femAccusativeStrategy (language_rules.mjs). An
// explicit `accusative` field on the entry always wins; the strategy only
// covers the regular pattern so not every feminine noun needs the field.
const FEM_ACC_STRATEGIES = {
  uk: { noun: ukFeminineAccusative, adjective: ukFeminineAccusative },
  pl: { noun: plFeminineAccusativeNoun, adjective: plFeminineAccusativeAdjective },
};

// Adjective case shifts derivable by regular suffix rule, keyed by the same
// declared strategy id as FEM_ACC_STRATEGIES. Fired only where the head
// noun actually took the corresponding case, so languages that declare no
// strategy (or the "uk" strategy, which has no derivable entries here) are
// untouched. Multi-word forms are left alone, like the fem strategies.
const ADJ_CASE_STRATEGIES = {
  pl: {
    // masc-animate accusative: «duży»→«dużego», «drogi»→«drogiego»
    animateAccusative: (w) => {
      const s = String(w);
      if (s.includes(" ")) return s;
      if (s.endsWith("i")) return s + "ego";
      if (s.endsWith("y")) return s.slice(0, -1) + "ego";
      return s;
    },
    // genitive plural from the plural form: «duże»→«dużych»,
    // «niebieskie»→«niebieskich»
    genitivePluralFromPlural: (w) => {
      const s = String(w);
      if (s.includes(" ")) return s;
      if (s.endsWith("ie")) return s.slice(0, -1) + "ch";
      if (s.endsWith("e")) return s.slice(0, -1) + "ych";
      return s;
    },
  },
};

function adjCaseStrategy(lang) {
  return ADJ_CASE_STRATEGIES[langRuleValue(lang, "caseMarking")?.femAccusativeStrategy] || null;
}

function ukObjectCaseApplies(lang) {
  return langRuleValue(lang, "caseMarking")?.directObjectCase === "accusative";
}

function femAccStrategy(lang) {
  return FEM_ACC_STRATEGIES[langRuleValue(lang, "caseMarking")?.femAccusativeStrategy] || null;
}

// Shift a rendered form to the feminine accusative via the language's
// declared strategy; identity when the language declares none. `kind` is
// "noun" or "adjective" — the endings differ in some languages.
function femAccusativeShift(lang, form, kind) {
  const strat = femAccStrategy(lang);
  return strat ? strat[kind](form) : form;
}

// Inanimate masculine and neuter accusative equals the nominative. Animate
// masculines (брат → брата, pl «student» → «studenta») follow no safe
// suffix rule, so they carry an explicit `accusative` field in the vocab
// data, which always wins. Feminine falls back to the declared strategy.
function accusativeNoun(lang, cid, base) {
  const entry = vocab().languages?.[lang]?.forms?.[cid];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return base;
  if (typeof entry.accusative === "string") return entry.accusative;
  const strat = femAccStrategy(lang);
  if (strat && entry.gender === "f") return strat.noun(base);
  return base;
}
// Back-compat alias (unit tests pin the uk behaviour through this name).
function ukAccusativeNoun(cid, base) {
  return accusativeNoun("uk", cid, base);
}

// --- Turkish HAVE existential possession ------------------------------------
// Turkish has no direct verb "to have"; possession is expressed with an
// existential clause: [POSSESSOR-GEN] [bir?] [POSSESSED-with-possessive-suffix]
// var. Three sub-rules interact — genitive on the possessor pronoun, matching
// possessive suffix on the possessed noun (with consonant assimilation and
// vowel harmony), and optional `bir` when the possessed is grammatically
// singular. This route bypasses the standard word-loop for tr HAVE templates
// entirely.

// Possessor pronoun in the genitive case («ben» → «benim»). Data-first: reads
// entry.genitive from lang/tr.json; falls back to the nominative surface so a
// missing-data bug fails visibly rather than silently.
function trGenitivePronoun(cid) {
  const entry = vocab().languages?.tr?.forms?.[cid];
  if (entry && typeof entry === "object" && !Array.isArray(entry) &&
      typeof entry.genitive === "string") {
    noteRule("genitive_possessor");
    return entry.genitive;
  }
  return formOf("tr", cid);
}

// The possessed noun bearing the person/number-matching possessive suffix
// («iş» + 1pl → «işimiz»; «gömlek» + 1sg → «gömleğim»). Data-first — each
// in-scope noun stores its 6 possessed surfaces explicitly to sidestep the
// consonant-assimilation + vowel-harmony + portmanteau -lArI minefield. Falls
// back to the bare form when no data exists so the failure mode is visible.
function trPossessedForm(cid, personKey) {
  const entry = vocab().languages?.tr?.forms?.[cid];
  if (entry && typeof entry === "object" && !Array.isArray(entry) &&
      entry.possessed && typeof entry.possessed[personKey] === "string") {
    return entry.possessed[personKey];
  }
  return formOf("tr", cid);
}

// Maps a subject pronoun concept to the possessive-suffix key used in the
// noun's `possessed` map. HE/SHE/IT all collapse to 3s (Turkish has no
// grammatical gender).
const TR_POSSESSOR_KEY = {
  FIRST_PERSON_SINGULAR: "1s",
  SECOND_PERSON: "2s",
  HE: "3s", SHE: "3s", IT: "3s",
  FIRST_PERSON_PLURAL: "1p",
  SECOND_PERSON_PLURAL: "2p",
  THIRD_PERSON_PLURAL: "3p",
};

// True when the template expresses HAVE — every HAVE template in the current
// catalog is existential possession (no metaphorical uses), so the concept
// membership check alone is sufficient.
function trIsHaveTemplate(tpl) {
  return Array.isArray(tpl?.concepts) && tpl.concepts.includes("HAVE");
}

// Assembles the full tr HAVE sentence, bypassing the standard clause builder.
// Emits: capitalize(genitive) + (bir?) + possessed-noun + " var" + finalizer.
// `bir` is inserted when the template carries an explicit `tr.insertBir` flag
// — safer than a substring heuristic on the possessed surface as HAVE
// templates proliferate.
function buildTrHavePossession(tpl) {
  const concepts = tpl?.concepts || [];
  const subjectCid = concepts.find(c => TR_POSSESSOR_KEY[c]);
  const objectCid = concepts.find(c =>
    vocab().concepts?.[c]?.type === "noun"
  );
  if (!subjectCid || !objectCid) return null;

  const personKey = TR_POSSESSOR_KEY[subjectCid];
  const possessor = trGenitivePronoun(subjectCid);
  const possessed = trPossessedForm(objectCid, personKey);
  const insertBir = tpl?.tr?.insertBir === true;

  noteRule("have_existential");
  const parts = [capitalizeFirst(possessor)];
  if (insertBir) parts.push("bir");
  parts.push(possessed, "var");
  return parts.join(" ") + ".";
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

// The predicate-noun slot of a copular clause: the word before it (skipping
// modifiers/possessives) is the copula («вона Є професорка», "she IS a
// professor"). Mirrors isDirectObjectPosition, which deliberately excludes
// copulas.
function isCopularPredicatePosition(ordered, idx) {
  let j = idx - 1;
  while (j >= 0) {
    const m = vocab().concepts?.[ordered[j]];
    if (m?.semantic_role === "possessive" || OBJECT_MODIFIER_TYPES.has(m?.type)) { j--; continue; }
    break;
  }
  if (j < 0) return false;
  return isCopulaConcept(ordered[j]);
}

// --- Ukrainian prepositional case -------------------------------------------
// uk prepositions govern the case of the nominal(s) that follow: «на цьому»
// (locative), «перед книгою» (instrumental), «до будинку» (genitive). Purely
// data-driven: a form only changes when its entry carries the matching case
// field, so entries without case data — and every other language — are
// untouched. The pending case survives modifiers and conjunctions («між цим
// і тим») and clears at a verb.
// The preposition→case table a language declares (language_rules.mjs
// caseMarking.prepositions), or null for non-case-marking languages.
function prepCaseTable(lang) {
  return langRuleValue(lang, "caseMarking")?.prepositions || null;
}

// Case each ordered position is governed by (declared case-marking
// languages only; null elsewhere).
function caseMap(lang, ordered) {
  const preps = prepCaseTable(lang);
  if (!preps) return ordered.map(() => null);
  let pending = null;
  return ordered.map((cid) => {
    if (preps[cid]) { pending = preps[cid]; return null; }
    const t = vocab().concepts?.[cid]?.type;
    if (t === "verb") { pending = null; return null; }
    if (t === "noun" || t === "pronoun") return pending;
    return null; // modifiers / conjunctions pass the case along
  });
}

// The declined form for a governed nominal, or null when no data exists.
function caseFormFor(lang, cid, caseName) {
  if (!caseName) return null;
  const entry = vocab().languages?.[lang]?.forms?.[cid];
  if (entry && !Array.isArray(entry) && typeof entry === "object" &&
      typeof entry[caseName] === "string") {
    return entry[caseName];
  }
  return null;
}

// Predicate-noun case (language_rules caseMarking.predicateNounCase —
// Polish instrumental: «Jestem mężczyzną»). Returns the case name when it
// applies to this ordered position, or null. Demonstrative subjects are
// exempt («To jest telefon» stays nominative); predicate ADJECTIVES never
// route here (they render through the adjective branch, nominative).
function predicateNounCaseFor(lang, ordered, idx, subjectCid, isCopularTemplate) {
  const predCase = langRuleValue(lang, "caseMarking")?.predicateNounCase;
  if (!predCase || !isCopularTemplate) return null;
  if (!isCopularPredicatePosition(ordered, idx)) return null;
  if (vocab().concepts?.[subjectCid]?.semantic_role === "demonstrative") return null;
  return predCase;
}

// The possessive's own declined form agreeing with a governed possessed
// noun: entry fields `<case>` (masc/neut) and `f_<case>` (feminine), e.g.
// pl instrumental «moim» / f_instrumental «moją». Null when data missing —
// the caller then keeps the whole phrase nominative so the two halves
// never mix cases.
function possessiveCaseForm(lang, possessiveCid, nounCid, caseName) {
  const mod = vocab().languages?.[lang]?.forms?.[possessiveCid];
  if (!mod || typeof mod !== "object" || Array.isArray(mod)) return null;
  const g = vocab().languages?.[lang]?.forms?.[nounCid]?.gender;
  const key = g === "f" ? `f_${caseName}` : caseName;
  return typeof mod[key] === "string" ? mod[key] : null;
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
// Derived from language_rules.mjs — the declaration lives there.
const ARTICLE_LANGS = langsWith("indefiniteArticle");

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
  let entry = vocab().languages?.[lang]?.forms?.[cid] || {};

  // Feminine-referent predicate («Вона професорка», "Ela é uma professora"):
  // shadow the entry with the feminitive form and feminine gender so every
  // per-language article branch below agrees without further special-casing.
  if (opts.feminineReferent && typeof entry.feminine === "string") {
    noteRule("gender_agreement");
    entry = { ...entry, form: entry.feminine, gender: "f" };
  }

  let base = entry.form || formOf(lang, cid);
  if (langRuleValue(lang, "caseMarking")?.directObjectCase === "accusative" &&
      opts.directObject && !opts.plural && !entry.pluralOnly) {
    const acc = accusativeNoun(lang, cid, base);
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

// Declared rule (language_rules.mjs secondPersonAsThird): 2nd-person
// subjects conjugate with 3rd-person morphology (pt você/vocês).
if (langRule(lang, "secondPersonAsThird")) {
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
  // Pronoun-less templates lead with a noun subject — copular ("autumn is
  // old", "the book is red") and plain SVO alike ("a Pokémon has a type").
  // Without this the leading noun is misread as the object («Мати покемона
  // тип» — infinitive verb, subject case-marked accusative) and the verb has
  // no subject to conjugate against. Treat the first noun as the subject.
  const nounSubject = !pronoun
    ? concepts.find(c => ["noun", "time"].includes(vocab().concepts[c]?.type))
    : null;
  const subject = pronoun || nounSubject;
  const object = concepts.find(c => {
    if (c === subject) return false;
    const t = vocab().concepts[c]?.type;
    return t && t !== "pronoun" && t !== "verb";
  });

  // Declared per language (language_rules.mjs `wordOrder`); SVO default.
  // MSA's canonical order is VSO, but SVO is equally standard in modern
  // usage and it is what the authored corpus uses throughout («أنا أشرب
  // ماء»), so ar declares nothing and takes the default.
const orderType = langRuleValue(lang, "wordOrder") || "SVO";

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
  function blankSentence(sentence, surface, lang = null) {
    const str = String(sentence || "");
    const target = String(surface || "").toLowerCase().trim();

    // If we don't know what to blank, don't pretend we did.
    if (!target) return str;

    // Substring matching so multi-word surface forms (e.g. "gym leader",
    // "лідер залу") are found and blanked correctly — but anchored on word
    // boundaries, so a citation stem never matches INSIDE its own inflected
    // form («dom» inside «домu» produced «Ja idę do _____u.» with the case
    // suffix stranded in the frame — Emi 2026-08-27-03). Spaceless-script
    // languages have no letter boundaries to anchor on and keep plain search.
    const lower = str.toLowerCase();
    const boundaryFree = lang !== null &&
      (SPACELESS_JOIN_LANGS.has(lang) || SPACELESS_TILE_LANGS.has(lang));
    const isLetter = (ch) => !!ch && /\p{L}/u.test(ch);
    let idx = lower.indexOf(target);
    while (idx !== -1 && !boundaryFree &&
           (isLetter(str[idx - 1]) || isLetter(str[idx + target.length]))) {
      idx = lower.indexOf(target, idx + 1);
    }
    if (idx === -1) return str;

    return str.slice(0, idx) + "_____" + str.slice(idx + target.length);
  }

  function safeSurfaceForConcept(tpl, targetLang, targetConcept) {
    const meta = vocab().concepts[targetConcept];
    if (!meta) return null;

    // Mirror renderSegments' subject resolution: pronoun subject first,
    // else the noun/time subject ("The hero IS brave", "Autumn IS old").
    // Restricting this to pronouns made getVerbForm fall back to the base
    // form ("be") for every noun-subject template, so the L3 blank never
    // matched the rendered "is" and ~80 template×verb combos per language
    // were silently untestable (surfaced by validate-exercise-surfaces).
    const subjectCid = (tpl.concepts || []).find(c =>
      vocab().concepts[c]?.type === "pronoun"
    ) || (tpl.concepts || []).find(c =>
      ["noun", "time"].includes(vocab().concepts[c]?.type)
    );

    if (meta.type === "verb") {
      return getVerbForm(targetConcept, subjectCid, targetLang);
    }

    const authored = tpl.surface?.[targetLang]?.[targetConcept];
    if (authored) return authored;

    if (meta.type === "noun") {
      // Match the form the engine actually renders — blanking/prompting with
      // the dictionary form would no longer find it in the sentence.
      const ordered = orderedConceptsForTemplate(tpl, targetLang);
      const idx = ordered.indexOf(targetConcept);
      // Feminitive predicate after a feminine subject («Вона професорка») —
      // without this the blank substring-matches «професор» inside
      // «професорка» and renders «_____ка».
      const entry = vocab().languages?.[targetLang]?.forms?.[targetConcept];
      if (idx !== -1 && typeof entry?.feminine === "string" &&
          vocab().concepts[subjectCid]?.gender === "f" &&
          isCopularPredicatePosition(ordered, idx)) {
        return entry.feminine;
      }
      // A predicate noun takes its declared case («On jest kelnerem») —
      // same rule the render path applies via predicateNounCaseFor;
      // missing case data falls through to the nominative, exactly like
      // the render path does.
      if (idx !== -1) {
        const isCopularTpl = ordered.some(c =>
          c === "BE" || vocab().concepts[c]?.semantic_role === "copula");
        const predCase = predicateNounCaseFor(
          targetLang, ordered, idx, subjectCid, isCopularTpl);
        if (predCase) {
          const declined = caseFormFor(targetLang, targetConcept, predCase);
          if (declined) return declined;
        }
        // A preposition-governed noun appears in the governed case
        // («do domu», «na stole») — the blank must hold the whole
        // declined word, not the citation stem.
        const governed = caseMap(targetLang, ordered)[idx];
        if (governed) {
          const declined = caseFormFor(targetLang, targetConcept, governed);
          if (declined) return declined;
        }
        // A template-carried numeral five+ governs the genitive plural
        // («pięć książek») — mirror the render path's numeral government.
        if (langRule(targetLang, "numeralGenitivePlural")) {
          for (let j = idx - 1; j >= 0; j--) {
            const t = vocab().concepts[ordered[j]]?.type;
            if (t === "verb") break;
            if (t === "number") {
              if ((NUMBER_VALUES[ordered[j]] || 0) >= 5) {
                const gp = entry?.genitive_plural;
                if (gp) return gp;
              }
              break;
            }
          }
        }
      }
      // A uk noun in object position appears in the accusative («воду»).
      if (langRuleValue(targetLang, "caseMarking")?.directObjectCase === "accusative" &&
          idx !== -1 && isDirectObjectPosition(ordered, idx)) {
        return accusativeNoun(targetLang, targetConcept, formOf(targetLang, targetConcept));
      }
    }

    return formOf(targetLang, targetConcept);
  }

  // The slot a concept occupies in a template, as the case machinery sees
  // it — the shared context that keeps the L3 blank and its option tiles
  // rendering through identical rules (Emi 2026-08-27-02).
  function slotContextFor(tpl, targetLang, targetConcept) {
    const ordered = orderedConceptsForTemplate(tpl, targetLang) || [];
    const idx = ordered.indexOf(targetConcept);
    if (idx === -1) return { position: "other", caseName: null };
    const subjectCid = ordered.find(c => vocab().concepts[c]?.type === "pronoun") ||
      ordered.find(c => ["noun", "time"].includes(vocab().concepts[c]?.type));
    const isCopularTpl = ordered.some(c =>
      c === "BE" || vocab().concepts[c]?.semantic_role === "copula");
    const feminineSubject = vocab().concepts[subjectCid]?.gender === "f";
    const predCase = predicateNounCaseFor(
      targetLang, ordered, idx, subjectCid, isCopularTpl);
    if (predCase) return { position: "predicateNoun", caseName: predCase, feminineSubject };
    if (isCopularTpl && isCopularPredicatePosition(ordered, idx)) {
      // Predicate position in a language without predicateNounCase — no
      // case, but the feminitive rule still applies («Elle est une
      // guerrière», "Sie ist eine Kriegerin").
      return { position: "predicateNoun", caseName: null, feminineSubject };
    }
    const prepCase = caseMap(targetLang, ordered)[idx];
    if (prepCase) return { position: "prepObject", caseName: prepCase };
    if (isDirectObjectPosition(ordered, idx)) {
      const doCase = langRuleValue(targetLang, "caseMarking")?.directObjectCase || null;
      return { position: "directObject", caseName: doCase };
    }
    return { position: idx === 0 ? "subject" : "other", caseName: null };
  }

  // Render `cid` as it would surface in the given slot — the ONE function
  // both the L3 blank and every option tile go through, so they cannot
  // diverge (the frame demanded «kobietą» while tiles offered «kobieta»).
  // Returns null when the concept has no form for a case-governed slot —
  // callers skip such distractors rather than showing a nominative that
  // cannot fill the blank.
  function optionSurfaceFor(targetLang, tpl, cid, slot, { bareMode = false } = {}) {
    const meta = vocab().concepts[cid];
    if (!meta) return null;
    if (meta.type === "verb") {
      return safeSurfaceForConcept(tpl, targetLang, cid);
    }
    // Feminitive predicate after a feminine subject — the same rule
    // safeSurfaceForConcept applies to the blank («guerrière», never the
    // masculine «guerrier» on a SHE_IS_… tile).
    if (slot?.position === "predicateNoun" && slot.feminineSubject) {
      const entry = vocab().languages?.[targetLang]?.forms?.[cid];
      if (typeof entry?.feminine === "string") {
        return bareMode || !ARTICLE_LANGS.has(targetLang)
          ? entry.feminine
          : nounPhrase(targetLang, cid, { feminineReferent: true });
      }
    }
    if (slot?.caseName) {
      if (slot.position === "directObject" && slot.caseName === "accusative") {
        // Explicit field wins, then the declared strategy, then the
        // nominative — accusative/nominative syncretism IS the surface
        // for inanimates, so this never returns null.
        return accusativeNoun(targetLang, cid, formOf(targetLang, cid));
      }
      return caseFormFor(targetLang, cid, slot.caseName);
    }
    return bareMode ? formOf(targetLang, cid) : nounPhrase(targetLang, cid);
  }

  // Case/gender/number-aware surface for a modifier tile agreeing with
  // `headNounCid` — mirrors what the render path does to the adjective
  // (genderedFormOf plus the feminine-accusative shift), so the tile
  // matches the blank («dużą», not «duża»).
  function modifierSurfaceFor(targetLang, modifierCid, headNounCid,
    { plural = false, genderOverride = null, caseName = null } = {}) {
    if (!vocab().concepts[modifierCid]) return null;
    let word = headNounCid
      ? genderedFormOf(targetLang, modifierCid, headNounCid, plural, genderOverride)
      : formOf(targetLang, modifierCid);
    if (word && caseName === "accusative" && !plural &&
        vocab().languages?.[targetLang]?.forms?.[headNounCid]?.gender === "f") {
      word = femAccusativeShift(targetLang, word, "adjective");
    }
    return word;
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
  // Animacy filter (Dan ruling 2026-08-27): OLD/NEW never modify people —
  // 古い女の子 ("old girl" with the inanimate 古い) was Emi's Japanese
  // catch, and the class is wrong-not-odd across languages. YOUNG stays the
  // people-age adjective via property_youth above. Standing line: wrong
  // gets filtered, odd gets shipped.
  property_time:        new Set(["person", "family", "role"]),
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
  // Nouns whose usual rendering is adverbial ("home" → «додому», "eve")
  // never take attributive modifiers — "red home" isn't a noun phrase.
  if (nounMeta.noModifier) return false;
  return adjectiveRoleAllowsNoun(adjMeta.semantic_role, nounMeta.semantic_role);
}

// Numeric value of the number concepts (ONE..TWENTY) — used by numeral
// government (language_rules: numeralGenitivePlural).
const NUMBER_VALUES = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8,
  NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14,
  FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19,
  TWENTY: 20,
};

function isModifierCompatible(lang, modifierCid, nounCid) {
  const nounMeta  = vocab().concepts[nounCid];
  const nounEntry = vocab().languages?.[lang]?.forms?.[nounCid] || {};
  // An explicit countable:false always wins — gender data (added for
  // article/agreement) must not re-open mass nouns to "tre acqua".
  if (nounMeta?.countable === false) return false;
  // noModifier: the noun's usual rendering is adverbial ("home" → «додому»),
  // so neither adjectives nor numbers can attach to it in any language.
  if (nounMeta?.noModifier) return false;
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

  // Numeral government (language_rules: numeralGenitivePlural — Polish):
  // five and above govern the genitive plural («pięć książek»). A noun
  // without the genitive_plural field cannot take such a number — the
  // number is skipped rather than shipping «pięć książki». Wrong gets
  // filtered, odd gets shipped.
  if (modMeta.type === "number" &&
      langRule(lang, "numeralGenitivePlural") &&
      (NUMBER_VALUES[modifierCid] || 0) >= 5 &&
      typeof nounEntry.genitive_plural !== "string") {
    return false;
  }

  // Virile (masculine-personal) nouns take special numeral forms the
  // engine has no data for («pięciu mężczyzn», «czterej bracia» — not the
  // counting forms pięć/cztery). Skip numbers on virile nouns entirely
  // rather than shipping the non-virile numeral. Wrong gets filtered.
  if (modMeta.type === "number" &&
      langRule(lang, "virilePlural") && nounEntry.virile) {
    return false;
  }

  if (BROAD_SOURCE_FILES.has(modMeta.source)) return true;
  return modMeta.source === nounMeta?.source;
}

function buildSameTypeOptions(targetConcept, desiredTotal = 4, targetLang = null, surfaceFn = null) {
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
  // `surfaceFn` lets the caller dedupe (and filter) on the SLOT surface the
  // tiles will actually show — a null return marks a concept with no valid
  // surface for the slot (missing case data) and skips it.
  if (targetLang) {
    const surface = surfaceFn || ((cid) => formOf(targetLang, cid));
    const correctSurface = surface(targetConcept);
    if (correctSurface === null || correctSurface === undefined) return null;
    const seen = new Set([correctSurface]);
    const distractors = [];
    for (const cid of shuffle(pool)) {
      const form = surface(cid);
      if (form === null || form === undefined || seen.has(form)) continue;
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
const SPACELESS_JOIN_LANGS = langsWith("spacelessJoin");
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
  // Polish sets off its conjunctions with a comma («śniadanie, ale nie
  // obiad», «..., ponieważ on jest w domu») — and lengthens z/w before
  // clusters the short form can't precede: «ze swoją mamą», «we wtorek».
  // Applied to the finished string since clauses are assembled by several
  // builders.
  if (lang === "pl") {
    let s = sentence.replace(/([^,])\s+(ale|ponieważ)\s/g, "$1, $2 ");
    // Negation attaches to the verb: OFF renders as «nie na», but the
    // negator must precede the copula — «nie jest na tym», never
    // «jest nie na tym».
    s = s.replace(/\b(jestem|jesteś|jest|jesteśmy|jesteście|są)\s+nie\s+/g,
      "nie $1 ");
    const C = "bcćdfghjklłmnńprsśtwzźż";
    s = s.replace(new RegExp(`(^|\\s)([zZ])\\s+(?=[sśzźż][${C}])`, "g"),
      (m, pre, z) => pre + (z === "Z" ? "Ze " : "ze "));
    s = s.replace(new RegExp(`(^|\\s)([wW])\\s+(?=[wf][${C}])`, "g"),
      (m, pre, w) => pre + (w === "W" ? "We " : "we "));
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

// Per-language rule (language_rules: possessiveDefiniteArticle): the
// definite article a possessive noun phrase carries, or null when the
// language (or this noun) takes none. Italian: «la mia mano», «il suo
// taxi», «le mie scarpe» — except nouns flagged noArticleWithPossessive
// (singular unmodified family members: «sua figlia»). This is THE single
// implementation of the rule — every render path that emits a possessive +
// noun pair (template slot walk, forced-modifier splice, clause builders)
// must call it rather than re-deriving the article locally. That is what
// keeps the rule from silently missing a path, which is exactly how the
// Italian launch shipped «suo taxi».
function possessiveArticleFor(lang, nounCid, plural = false) {
  if (!langRule(lang, "possessiveDefiniteArticle")) return null;
  const entry = vocab().languages?.[lang]?.forms?.[nounCid];
  if (!entry || entry.noArticleWithPossessive) return null;
  if (lang === "it") {
    const f = entry.gender === "f";
    if (plural || entry.pluralOnly) return f ? "le" : "i";
    return f ? "la" : "il";
  }
  return null;
}

// `caseName` (uk): render the possessed noun in the case its governing
// preposition demands («з його мамою»), when the entry carries the data.
function nounWithPossessive(lang, possessiveCid, nounCid, caseName = null) {
  if (lang === "fr") return frenchPossessivePhrase(possessiveCid, nounCid);
  let noun = formOf(lang, nounCid);
  if (langRuleValue(lang, "caseMarking")) {
    const declined = caseFormFor(lang, nounCid, caseName);
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
  // Possessive noun phrases take the definite article in languages
  // declaring possessiveDefiniteArticle («il tuo telefono», «le tue
  // scarpe») — the rule lives once, in possessiveArticleFor.
  {
    const nounEntry = vocab().languages?.[lang]?.forms?.[nounCid];
    const art = possessiveArticleFor(lang, nounCid);
    if (art) {
      if (nounEntry?.pluralOnly) {
        const pl = genderedFormOf(lang, possessiveCid, nounCid, true);
        return `${art} ${pl} ${noun}`;
      }
      return `${art} ${possessive} ${noun}`;
    }
  }
  return `${possessive} ${noun}`;
}

// Languages where adjective follows the noun (e.g. "casa grande").
// Derived from language_rules.mjs — the declaration lives there.
const POST_ADJECTIVE_LANGS = langsWith("postNominalAdjectives");

// Languages that omit the present-tense copula. Ukrainian (and Russian-style
// Slavic) drop "to be" in the present ("Це телефон", not "Це є телефон"),
// Arabic nominal sentences carry no copula ("هذا هاتف"), and Turkish present-
// tense nominal sentences use a zero/suffix copula ("O bir öğrenci", not
// "O olur öğrenci" — olmak means "to become"). Other supported languages
// (en/es/pt/de/fr/el/no) keep an overt copula. Present tense only — these
// templates are all present tense.
// Derived from language_rules.mjs — the declaration lives there.
const ZERO_PRESENT_COPULA = langsWith("zeroPresentCopula");

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

// Turkish suffixal copula (predicative -DIR): formal present-tense nominal
// sentences carry a bound copular suffix on the predicate — "Kitap kırmızıdır"
// ("The book is red"), "Sabah iyidir" ("Morning is good"), "Bu benim elimdir"
// ("This is my hand"). The variant is picked by vowel harmony (last vowel of
// the stem: a/ı → ı, e/i → i, o/u → u, ö/ü → ü) and consonant assimilation
// (voiceless final consonant p/ç/t/k/f/s/ş/h → t-, otherwise d-). ZERO_PRESENT
// _COPULA still drops the verb as a separate word — the suffix attaches
// post-render to the last word of the sentence, so the copular still fires
// noteRule("zero_copula") through copulaForm above and this pass is silent.
const TR_BACK_UNROUNDED_VOWELS  = new Set(["a", "ı"]);
const TR_BACK_ROUNDED_VOWELS    = new Set(["o", "u"]);
const TR_FRONT_UNROUNDED_VOWELS = new Set(["e", "i"]);
const TR_FRONT_ROUNDED_VOWELS   = new Set(["ö", "ü"]);
const TR_VOWELS = new Set([
  ...TR_BACK_UNROUNDED_VOWELS,
  ...TR_BACK_ROUNDED_VOWELS,
  ...TR_FRONT_UNROUNDED_VOWELS,
  ...TR_FRONT_ROUNDED_VOWELS,
]);
const TR_VOICELESS_CONSONANTS = new Set(["p", "ç", "t", "k", "f", "s", "ş", "h"]);

function turkishCopulaSuffix(word) {
  const lower = word.toLowerCase();
  let harmony = null;
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i];
    if (!TR_VOWELS.has(ch)) continue;
    if (TR_BACK_UNROUNDED_VOWELS.has(ch))       harmony = "ı";
    else if (TR_BACK_ROUNDED_VOWELS.has(ch))    harmony = "u";
    else if (TR_FRONT_UNROUNDED_VOWELS.has(ch)) harmony = "i";
    else if (TR_FRONT_ROUNDED_VOWELS.has(ch))   harmony = "ü";
    break;
  }
  if (!harmony) return word;
  const initial = TR_VOICELESS_CONSONANTS.has(lower[lower.length - 1]) ? "t" : "d";
  return word + initial + harmony + "r";
}

// Structures whose Turkish authored render does NOT carry the -DIR suffix.
// AUTHORED_ONLY_STRUCTURES bypass the engine entirely (declared below). The
// remaining exclusions:
//   - spatial_relation / spatial_relation_complex — locative predicates
//     ("Kitap bunun üstünde") sit unsuffixed;
//   - complex_clause — coordinated / subordinate clauses drop the suffix
//     ("Bu benim elim ve bu senin başın");
//   - yes_no_question_copular — the question particle "mu" takes the
//     tail slot instead ("Şu senin telefonun mu?");
//   - copular_demonstrative — an adjective-modified indefinite noun predicate
//     ("Bu iyi bir kitap") reads as introduction, not general truth.
const TR_NON_DIR_STRUCTURES = new Set([
  "spatial_relation", "spatial_relation_complex",
  "complex_clause", "yes_no_question_copular",
  "copular_demonstrative",
]);

function applyTurkishCopulaSuffix(lang, tpl, sentence) {
  if (lang !== "tr" || !sentence) return sentence;
  const concepts = tpl?.concepts;
  if (!Array.isArray(concepts) || !concepts.includes("BE")) return sentence;
  const structType = tpl?.structure?.type;
  if (TR_NON_DIR_STRUCTURES.has(structType)) return sentence;
  if (AUTHORED_ONLY_STRUCTURES.has(structType)) return sentence;
  // First/second person subjects take -(y)Im / -sIn / -(y)Iz / -sInIz instead
  // of -DIr ("Ben bir adamım", "Sen bir kızsın"). Those personal endings are
  // out of scope here — leave the sentence alone so the personal templates
  // stay in their existing (still-baselined) state.
  const conceptTable = vocab().concepts || {};
  const subjectCid = concepts.find(c => conceptTable[c]?.type === "pronoun") ||
                     concepts[0];
  const subjectPerson = conceptTable[subjectCid]?.person;
  if (subjectPerson === "1" || subjectPerson === "2") return sentence;
  // Peel any terminal punctuation, splice the suffix onto the last word, then
  // re-attach — cleaner than a regex that has to know periods are non-whitespace.
  const punctMatch = sentence.match(/[.?!]+$/);
  const punct = punctMatch ? punctMatch[0] : "";
  const body = punct ? sentence.slice(0, -punct.length) : sentence;
  const spaceIdx = body.lastIndexOf(" ");
  const lead = spaceIdx >= 0 ? body.slice(0, spaceIdx + 1) : "";
  const lastWord = spaceIdx >= 0 ? body.slice(spaceIdx + 1) : body;
  if (!lastWord) return sentence;
  return lead + turkishCopulaSuffix(lastWord) + punct;
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
  // with intonation («Esse é o seu telefone?»); question strategy is
  // declared per language (language_rules.mjs): statementOrderQuestion
  // keeps declarative order and asks with intonation; questionParticle
  // keeps declarative order behind a fronted particle («Czy to jest twój
  // telefon?»); the default fronts the copula ("Is this your phone?",
  // "Ist das dein Telefon?").
  const particle = langRuleValue(lang, "questionParticle");
  const words = (particle || langRule(lang, "statementOrderQuestion"))
    ? [particle || "", subject, be, complement]
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
        prepCaseTable(lang)?.[withCid] || null)])
    : "";

  return joinWords(lang, [subject, verb, object, companion]);
}

function buildSubjectVerbWithPossessiveClause(lang, subjectCid, verbCid, withCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const verb = getVerbForm(verbCid, subjectCid, lang);
  const companion = nounCid
    ? joinWords(lang, [formOf(lang, withCid), nounWithPossessive(lang, possessiveCid, nounCid,
        prepCaseTable(lang)?.[withCid] || null)])
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
  const finalized = finalizeSentence(
    lang,
    buildSentenceRaw(lang, tpl, forcedConcept, sharedChoices)
  );
  return applyTurkishCopulaSuffix(lang, tpl, finalized);
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
if (lang === "tr" && trIsHaveTemplate(tpl)) {
  const built = buildTrHavePossession(tpl);
  if (built) return built;
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
  const segments = renderSegments(lang, tpl, forcedConcept, sharedChoices);
  if (!segments) return "";
  if (lang === "ja") return segments.map(s => s.text).join("");
  let sentence = joinWords(lang, segments.map(s => s.text));
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return sentence + ".";
}

// The generic render path shared by buildSentenceRaw and the L6 word-tile
// builder: renders each ordered concept to its surface text and returns
// [{cid, text}] segments (ja particles carry cid: null; empty renders such
// as a dropped copula are filtered out). Keeping tiles on this exact code
// path is what guarantees they always match the sentence the engine grades
// against.
function renderSegments(lang, tpl, forcedConcept = null, sharedChoices = null) {
  const ordered = orderedConceptsForTemplate(tpl, lang);
  if (!ordered || !ordered.length) return null;

  const forcedMeta = forcedConcept
    ? vocab().concepts[forcedConcept]
    : null;

  const isCopularTemplate = ordered.some(c =>
    c === "BE" || vocab().concepts[c]?.semantic_role === "copula"
  );

  // The subject is normally a pronoun. Pronoun-less templates ("autumn is
  // old", "a Pokémon has a type") have a noun — or time-word — subject
  // instead; without it the verb has no subject and renders the bare
  // infinitive ("Be autumn old", «Мати покемона тип»), and the predicate
  // adjective has nothing to agree with («ніч темна»). Relational
  // templates ("the shoes are under this") lead with their head noun — the
  // trailing demonstrative is a landmark, not the subject, and must not
  // steal copula agreement ("the shoes IS under this").
  const relationalHead =
    RELATIONAL_STRUCTURES.has(tpl.structure?.type) &&
    ["noun", "time"].includes(vocab().concepts[ordered[0]]?.type)
      ? ordered[0] : null;
  const subjectCid = relationalHead ||
    ordered.find(c => vocab().concepts[c]?.type === "pronoun") ||
    ordered.find(c => ["noun", "time"].includes(vocab().concepts[c]?.type));

  // For copular templates (subject + BE + predicate-noun), the predicate
  // noun must agree with the subject in number. We treat any template that
  // uses the BE verb as copular and pluralise its predicate noun(s) when
  // the subject pronoun is plural. Non-copular SVO ("they have a book")
  // intentionally keeps the singular object.
  const subjectIsPluralPronoun = isPluralPronoun(subjectCid);
  const pluralAgreement = subjectIsPluralPronoun && isCopularTemplate;

  // Which case (if any) governs each position — uk prepositional case.
  const caseAt = caseMap(lang, ordered);

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
  const governedForm = caseFormFor(lang, cid, caseAt[idx]);
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
  const ukObjectCase = langRuleValue(lang, "caseMarking")?.directObjectCase === "accusative" &&
    isObject && !pluralAgreement;
  // Copular agreement: this noun is the predicate after a plural subject.
  // Possessed nouns (their/our + noun) follow the possessive's own number,
  // not the subject's, so skip them.
  const bareDetermined = precededByPossessive || precededByModifier;
  const useCopularPlural = pluralAgreement && !bareDetermined;
  // A predicate noun after a feminine-referent subject pronoun uses its
  // feminitive when the data provides one: «Вона професорка», "Ela é uma
  // professora" — the masculine dictionary form (and its article) misgender
  // the referent. Data-driven via the per-language `feminine` field; nouns
  // without it, other subjects, and non-predicate positions are untouched.
  const nounEntry = vocab().languages?.[lang]?.forms?.[cid];
  const feminineReferent = isCopularTemplate &&
    vocab().concepts[subjectCid]?.type === "pronoun" &&
    vocab().concepts[subjectCid]?.gender === "f" &&
    isCopularPredicatePosition(ordered, idx) &&
    typeof nounEntry?.feminine === "string";
  let possessedForm = feminineReferent ? nounEntry.feminine : formOf(lang, cid);
  if (ukObjectCase && bareDetermined &&
      vocab().languages?.[lang]?.forms?.[cid]?.gender === "f") {
    const acc = femAccusativeShift(lang, possessedForm, "noun");
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
  // Predicate nouns after the copula take a declared case in some
  // languages («Jestem mężczyzną», plural «Oni są studentami»). When the
  // slot is possessed, BOTH halves must decline or neither does («Ona
  // jest moją mamą» — never «moja mamą»); the possessive slot mirrors
  // this check. Modifier injection is deliberately skipped on a declined
  // predicate — an injected adjective cannot agree in case yet, and
  // wrong gets filtered, odd gets shipped. Missing case data falls back
  // to the nominative phrase, which validate-exercise-surfaces ratchets.
  const predNounCase = predicateNounCaseFor(lang, ordered, idx, subjectCid, isCopularTemplate);
  if (predNounCase) {
    const declined = caseFormFor(lang, cid,
      useCopularPlural ? predNounCase + "_plural" : predNounCase);
    if (declined && (!precededByPossessive ||
        possessiveCaseForm(lang, ordered[idx - 1], cid, predNounCase))) {
      noteRule("predicate_instrumental");
      // Same cross-build guard as the surface-override return below: this
      // noun rendered declined with no modifier — pin that in
      // sharedChoices (only unset keys) so the paired build cannot roll
      // its own rng modifier for it («She is a big woman.» prompting
      // «Ona jest kobietą.» was Emi 2026-08-27-01's copular face).
      if (sharedChoices) {
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "adj_" + cid)) {
          sharedChoices["adj_" + cid] = null;
        }
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "num_" + cid)) {
          sharedChoices["num_" + cid] = null;
        }
      }
      return declined;
    }
  }

  let phrase = bareDetermined
    ? possessedForm
    : nounPhrase(lang, cid, {
        plural: useCopularPlural,
        directObject: isObject,
        feminineReferent,
      });
  // When the noun was rendered as plural via copular agreement, the bare
  // form used by the modifier branches below also needs to be plural so
  // adjective insertion produces "small leaders" not "small leader".
  let bareNoun = useCopularPlural
    ? (lang === "en" ? pluralize(formOf(lang, cid)) : pluralFormOf(lang, cid))
    : null;

  // An authored surface the engine cannot derive itself («додому», "eve")
  // IS the correct rendering of this slot — injecting a modifier would
  // discard it and rebuild from the dictionary form («Ти йдеш червоний
  // дім»: nominative, motion sense lost). The authored surface wins outright
  // and injection is skipped; hadModifier stays false so callers know the
  // modifier did not land. Surfaces the engine derives identically anyway
  // («книгу», the regular accusative) keep accepting modifiers. Article
  // languages store surfaces bare — same containment guard as below.
  if (!useCopularPlural) {
    const surfaceOverride = tpl.surface?.[lang]?.[cid];
    if (typeof surfaceOverride === "string" &&
        surfaceOverride !== formOf(lang, cid) &&
        (!ARTICLE_LANGS.has(lang) || surfaceOverride.includes(formOf(lang, cid))) &&
        surfaceOverride !== phrase) {
      // Returning before the modifier branches means no random modifier can
      // land on this noun — record that in sharedChoices (only where the
      // key is still unset, so a seeded drilled modifier keeps its bail
      // semantics) or the OTHER language's build would roll its own rng
      // modifier for the same noun and the pair would diverge silently.
      if (sharedChoices) {
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "adj_" + cid)) {
          sharedChoices["adj_" + cid] = null;
        }
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "num_" + cid)) {
          sharedChoices["num_" + cid] = null;
        }
      }
      return surfaceOverride;
    }
  }

  let adjectiveWord = null;
  let adjectiveCid = null;
  let numberWord = null;
  let numberCid = null;

  // adjective
  const cachedAdj = sharedChoices && Object.prototype.hasOwnProperty.call(sharedChoices, "adj_" + cid)
    ? sharedChoices["adj_" + cid]
    : undefined;
  const adjGenderOverride = feminineReferent ? "f" : null;
  if (forcedMeta?.type === "adjective") {
    // The forced path must respect the same compatibility rule as random
    // injection — this is the mass-noun/animacy filter for drilled
    // modifiers («quattro acqua», "old girl"). Possessives are exempt:
    // they are determiners, and "his water" / «il suo cibo» is fine.
    const forcedPossessive = forcedMeta.semantic_role === "possessive";
    if (forcedPossessive || isModifierCompatible(lang, forcedConcept, cid)) {
      adjectiveCid = forcedConcept;
      adjectiveWord = genderedFormOf(lang, forcedConcept, cid, false, adjGenderOverride);
    }
  } else if (cachedAdj !== undefined) {
    // Cached choices render unchecked BY DESIGN: the choice already passed
    // the compat gate where it was made (random injection or the drill
    // seeding), and re-gating here would desync the target/support pair —
    // the pair must render the same choice or bail together, and the
    // modifier-identity fence is what catches genuine asymmetries.
    adjectiveCid = cachedAdj;
    adjectiveWord = cachedAdj ? genderedFormOf(lang, cachedAdj, cid, false, adjGenderOverride) : null;
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
      adjectiveWord = genderedFormOf(lang, adj, cid, false, adjGenderOverride);
    }
    if (sharedChoices) sharedChoices["adj_" + cid] = adjectiveCid;
  }

  // number
  const cachedNum = sharedChoices && Object.prototype.hasOwnProperty.call(sharedChoices, "num_" + cid)
    ? sharedChoices["num_" + cid]
    : undefined;
  if (forcedMeta?.type === "number") {
    // Same compatibility gate as random injection: a number never counts a
    // mass noun, in ANY language — «Io bevo quattro acqua» / "I drink eight
    // waters" both came from this path skipping the check.
    if (isModifierCompatible(lang, forcedConcept, cid)) {
      numberCid = forcedConcept;
      numberWord = formOf(lang, forcedConcept);
    }
  } else if (cachedNum !== undefined) {
    // Cached choices render unchecked by design — see the adjective note.
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
      // Same cross-build guard as the surface-override return above: this
      // noun rendered without a modifier — pin that for the paired build.
      if (sharedChoices) {
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "adj_" + cid)) {
          sharedChoices["adj_" + cid] = null;
        }
        if (!Object.prototype.hasOwnProperty.call(sharedChoices, "num_" + cid)) {
          sharedChoices["num_" + cid] = null;
        }
      }
      return authoredNounSurface;
    }
  }

  // apply modifiers
  // When copular plural agreement applies, the bare form used by the
  // adjective branches must also be plural ("they are small leaders").
  if (adjectiveWord || numberWord) noteModifier(cid, adjectiveCid, numberCid);
  // The bare form must match the case actually rendered in `phrase`, or the
  // article/adjective splicing below misassembles the noun phrase.
  const bare = bareNoun ||
    (ukObjectCase && !bareDetermined ? accusativeNoun(lang, cid, formOf(lang, cid)) :
     ukObjectCase ? possessedForm :
     feminineReferent ? possessedForm :
     formOf(lang, cid));
  const POST_ADJ = POST_ADJECTIVE_LANGS.has(lang);
  const headEntry = vocab().languages?.[lang]?.forms?.[cid];
  // A plural-only head noun takes plural agreement even without a number:
  // «dei pantaloni grandi», never «dei pantaloni grande» (Emi 2026-08-27-04's
  // Italian half).
  if (adjectiveWord && adjectiveCid && lang !== "en" && headEntry?.pluralOnly) {
    adjectiveWord = genderedFormOf(lang, adjectiveCid, cid, true, adjGenderOverride);
  }
  // An adjective on a feminine accusative object agrees in case too:
  // «я п'ю холодну воду», not «холодна воду». Ukrainian feminine adjectives
  // end in -а/-я like the nouns, so the same ending shift applies.
  const ukShiftAdj = ukObjectCase && !useCopularPlural &&
    headEntry?.gender === "f";
  if (ukShiftAdj && adjectiveWord) adjectiveWord = femAccusativeShift(lang, adjectiveWord, "adjective");
  // A masculine-animate accusative object carries the adjective with it:
  // «On ma dużego syna», never «On ma duży syna». The noun's explicit
  // `accusative` differing from the nominative is the animacy marker; the
  // shift itself comes from the language's declared strategy family
  // (Emi 2026-08-27-04's Polish half — uk declares no derivable entry
  // here, so uk output is unchanged).
  if (adjectiveWord && ukObjectCase && !useCopularPlural &&
      headEntry?.gender === "m" &&
      typeof headEntry?.accusative === "string" &&
      headEntry.accusative !== formOf(lang, cid)) {
    const strat = adjCaseStrategy(lang);
    if (strat?.animateAccusative) {
      adjectiveWord = strat.animateAccusative(adjectiveWord);
    }
  }

  if (numberWord) {
    // Same surface capture for a forced number modifier (see adjective note).
    if (sharedChoices && numberCid === forcedConcept) {
      const k = "blankSurface_" + lang;
      if (!(k in sharedChoices)) sharedChoices[k] = numberWord;
    }
    // Numbers replace the article: "two books" not "two a book"
    const isPlural = numberCid !== "ONE";
    let nounForm;
    let numeralGoverned = false;
    if (!isPlural) {
      nounForm = bare;
    } else if (lang === "en") {
      const enEntry = vocab().languages?.en?.forms?.[cid] || {};
      nounForm = (enEntry.invariantPlural || enEntry.pluralOnly) ? bare : pluralize(bare);
    } else if (langRule(lang, "numeralGenitivePlural") &&
               (NUMBER_VALUES[numberCid] || 0) >= 5 &&
               typeof vocab().languages?.[lang]?.forms?.[cid]?.genitive_plural === "string") {
      // Numeral government: «pięć książek», not «pięć książki». The
      // compatibility gate guarantees the field exists when the number
      // landed here.
      noteRule("numeral_government");
      nounForm = vocab().languages?.[lang]?.forms?.[cid].genitive_plural;
      numeralGoverned = true;
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
      let adjForm = (isPlural && adjectiveCid && lang !== "en")
        ? genderedFormOf(lang, adjectiveCid, cid, true)
        : adjectiveWord;
      // Numeral government carries the adjective along: «osiem dużych
      // twarzy», never «osiem duże twarzy» (Emi 2026-08-27-04). Derived
      // from the plural form via the language's declared strategy family.
      if (numeralGoverned) {
        const strat = adjCaseStrategy(lang);
        if (strat?.genitivePluralFromPlural) {
          adjForm = strat.genitivePluralFromPlural(adjForm);
        }
      }
      return (POST_ADJ && !adjectivePreOrder(lang))
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
      // Possessives replace the indefinite article ("her wizard", not
      // "a her wizard") — but possessiveDefiniteArticle languages put the
      // definite article in front of the pair: «il suo cibo», «le sue
      // scarpe». This is the forced-modifier path (drilled possessives at
      // L2/L3), which shipped «suo taxi» for Italian because the article
      // rule previously lived only on the template-slot path.
      const possNounEntry = vocab().languages?.[lang]?.forms?.[cid];
      const possPlural = !!possNounEntry?.pluralOnly;
      const possForm = possPlural
        ? genderedFormOf(lang, adjectiveCid, cid, true)
        : adjForm;
      const art = possessiveArticleFor(lang, cid, possPlural);
      phrase = joinWords(lang, art ? [art, possForm, bare] : [possForm, bare]);
    } else if (POST_ADJ && !adjectivePreOrder(lang)) {
      // Article + noun + adjective: "uma casa grande" (spaceless in th)
      phrase = joinWords(lang, [phrase, adjForm]);
    } else if (phrase !== bare) {
      // Has article — insert adjective between: "a big house"
      let article = phrase.substring(0, phrase.length - bare.length).trimEnd();
      // For English, recompute article against the adjective (next word after article).
      if (lang === "en" && /^an?$/i.test(article)) {
        article = englishIndefiniteArticle(adjForm);
      }
      // Italian allomorphy also keys on the following word — «uno zaino»
      // but «un vecchio zaino», «un'attrazione» but «una vecchia
      // attrazione». Only reached via the pre-order grading variant.
      if (lang === "it" && /^(un'|un|una|uno)$/i.test(article)) {
        article = /^(una|un')$/i.test(article)
          ? (IT_VOWEL_INITIAL.test(adjForm) ? "un'" : "una")
          : (IT_LO_INITIAL.test(adjForm) ? "uno" : "un");
      }
      phrase = article.endsWith("'")
        ? article + adjForm + " " + bare
        : article + " " + adjForm + " " + bare;
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
    // "this one" when it follows a positional preposition (in/on/under/…),
    // walking back over connectors and fellow demonstratives so a coordinated
    // pair stays parallel ("between this one and that one"). Other languages
    // take a standalone demonstrative naturally (e.g. uk «у тому», de «in
    // jenem»), so this is English-only.
    if (lang === "en" && (cid === "THIS" || cid === "THAT")) {
      let j = idx - 1;
      while (j >= 0 &&
             ["connector", "pronoun"].includes(vocab().concepts[ordered[j]]?.type)) j--;
      if (j >= 0 && vocab().concepts[ordered[j]]?.type === "position") {
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
    if (langRuleValue(lang, "caseMarking")?.bareInstrumentalMeans && cid === "BY" &&
        caseFormFor(lang, ordered[idx + 1], "instrumental")) {
      return "";
    }

    // A preposition-governed pronoun/demonstrative declines like a governed
    // noun («на цьому», «між цим і тим») when case data exists.
    if (meta.type === "pronoun") {
      const governed = caseFormFor(lang, cid, caseAt[idx]);
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
    // with the subject in gender — "осінь стара", not "осінь старий" — and
    // in number for plural-only subjects («штани чорні», "as calças são
    // pretas"). surfaceForm would return the bare (masculine singular) form.
    // Noun subjects agree via their own recorded gender; pronoun subjects
    // agree via the referent gender on the concept (SHE → «Вона вмотивована»,
    // "Ela é motivada"), which genderedFormOf takes as an override.
    if (meta.type === "adjective" && meta.semantic_role !== "possessive" &&
        isCopularTemplate) {
      const subjMeta = vocab().concepts[subjectCid];
      if (["noun", "time"].includes(subjMeta?.type)) {
        const subjEntry = vocab().languages?.[lang]?.forms?.[subjectCid];
        const subjPlural = !!(subjEntry && typeof subjEntry === "object" &&
          !Array.isArray(subjEntry) && subjEntry.pluralOnly);
        return genderedFormOf(lang, cid, subjectCid, subjPlural);
      }
      if (subjMeta?.type === "pronoun" && subjMeta?.gender === "f") {
        return genderedFormOf(lang, cid, subjectCid, false, "f");
      }
    }

    // An attributive adjective/quantifier directly before a noun agrees with
    // it («іншу книгу», "outra casa") — data-driven via gendered forms, and
    // shifted to the accusative alongside a feminine uk direct object.
    if ((meta.type === "quantifier" ||
         (meta.type === "adjective" && meta.semantic_role !== "possessive")) &&
        vocab().concepts[ordered[idx + 1]]?.type === "noun") {
      const nextCid = ordered[idx + 1];
      let form = genderedFormOf(lang, cid, nextCid);
      if (femAccStrategy(lang) && ukObjectCaseApplies(lang) &&
          isDirectObjectPosition(ordered, idx + 1) && !pluralAgreement &&
          vocab().languages?.[lang]?.forms?.[nextCid]?.gender === "f") {
        form = femAccusativeShift(lang, form, "adjective");
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
        // Mirror of the predicate-case check in the noun slot: when the
        // possessed predicate noun declines, the possessive declines with
        // it («moją mamą») — and when either half lacks data, both stay
        // nominative together.
        const possPredCase = predicateNounCaseFor(lang, ordered, idx + 1, subjectCid, isCopularTemplate);
        if (possPredCase && caseFormFor(lang, nextCid, possPredCase)) {
          const declinedPoss = possessiveCaseForm(lang, cid, nextCid, possPredCase);
          if (declinedPoss) return declinedPoss;
        }
        if (femAccStrategy(lang) && ukObjectCaseApplies(lang) &&
            isDirectObjectPosition(ordered, idx + 1) && !pluralAgreement &&
            vocab().languages?.[lang]?.forms?.[nextCid]?.gender === "f") {
          form = femAccusativeShift(lang, form, "adjective");
        }
        // Possessive noun phrases take the definite article in languages
        // declaring possessiveDefiniteArticle («la mia mano», «le mie
        // scarpe») — the rule lives once, in possessiveArticleFor.
        {
          const nounEntry = vocab().languages?.[lang]?.forms?.[nextCid];
          const art = possessiveArticleFor(lang, nextCid);
          if (art) {
            form = nounEntry?.pluralOnly
              ? art + " " + genderedFormOf(lang, cid, nextCid, true)
              : art + " " + form;
          }
        }
        return form;
      }
    }

    return surfaceForm(lang, cid);
  });

  const segments = ordered.map((cid, idx) => ({ cid, text: words[idx] }));

  if (lang === "ja") {
    const pronounIndex = ordered.findIndex(c =>
      vocab().concepts[c]?.type === "pronoun"
    );

    // Insert in reverse index order so earlier splices don't shift later indices
    const insertions = [];
    if (pronounIndex !== -1) {
      insertions.push({ idx: pronounIndex + 1, particle: "は" });
    } else if (subjectCid &&
               ["copular", "time_description"].includes(tpl.structure?.type) &&
               ["noun", "time"].includes(vocab().concepts[subjectCid]?.type)) {
      // Non-pronoun subject in an X_IS_ADJ copular sentence ("book is red",
      // "autumn is old"): attach the topic marker after the subject —
      // "本は赤いです。", "秋は古いです。". Restricted to the two structure
      // types that are structurally X_IS_ADJ (copular for BOOK_IS_RED etc.,
      // time_description for SEASON/DAY_IS_ADJ) so spatial_relation /
      // copular_demonstrative / yes_no_question_copular (all currently
      // baselined and structurally broken) are left alone.
      const subjIdx = ordered.indexOf(subjectCid);
      if (subjIdx !== -1) insertions.push({ idx: subjIdx + 1, particle: "は" });
    }
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
      segments.splice(ins.idx, 0, { cid: null, text: ins.particle });
    }
  }

  return segments.filter(s => s.text !== "" && s.text != null);
}

// Spaceless scripts can't be split into word tiles by whitespace — those
// targets keep the legacy per-concept tile path in the caller.
const SPACELESS_TILE_LANGS = langsWith("spacelessTiles");

// Tiles for fixed-form template shapes: tokenize the graded sentence itself,
// so the tiles can always rebuild it — the per-concept mapper knows nothing
// about authored word order, dropped copulas («є»), or derived adverbials
// («на північ»).
function tokenizedTiles(lang, tpl, sharedChoices) {
  if (SPACELESS_TILE_LANGS.has(lang)) return null;
  const sentence = buildSentence(lang, tpl, null, sharedChoices);
  if (!sentence || !sentence.trim()) return null;
  return sentence
    .replace(/^[¿¡]+\s*/, "")
    .replace(/[.?!;。？！]+\s*$/, "")
    .replace(/,/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ cid: null, text }));
}

// Word tiles for the L6 sentence builder, drawn from the same render path as
// buildSentence. Fixed-form template shapes (authored strings, dedicated
// builders) tokenize the finished sentence instead; a null return (spaceless
// scripts, empty renders) sends the caller to its legacy per-concept tiles.
function sentenceTilesForTemplate(lang, tpl, sharedChoices = null) {
  if (AUTHORED_ONLY_STRUCTURES.has(tpl.structure?.type)) {
    const authored = tpl.render?.[lang];
    if (typeof authored === "string" && authored.trim()) {
      return tokenizedTiles(lang, tpl, sharedChoices);
    }
  }
  if (lang === "tr" && trIsHaveTemplate(tpl) && buildTrHavePossession(tpl)) {
    return tokenizedTiles(lang, tpl, sharedChoices);
  }
  if (["copular_demonstrative", "yes_no_question_copular", "complex_clause"]
      .includes(tpl.structure?.type)) {
    return tokenizedTiles(lang, tpl, sharedChoices);
  }
  return renderSegments(lang, tpl, null, sharedChoices);
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
  caseMap,
  caseFormFor,
  accusativeNoun,
  predicateNounCaseFor,
  sentenceTilesForTemplate,
  blankSentence,
  safeSurfaceForConcept,
  slotContextFor,
  optionSurfaceFor,
  modifierSurfaceFor,
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
  buildSentenceWithRules,
  possessiveArticleFor,
  acceptedAnswerVariants,
  dropSubjectPronoun,
  resolveNounBlank
};
