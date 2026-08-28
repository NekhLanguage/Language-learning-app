#!/usr/bin/env node
// generatelanguageskeleton.js
// Scaffolds a NEW language's data files with empty stubs, so authoring is
// fill-in-the-blanks instead of shape-guessing. Part of the add-a-language
// pipeline (see CLAUDE.md): run this FIRST, then author the questionnaire
// profile, the model-sentence corpus, and the forms — the language stays
// `hidden: true` in languages.js until validate-language-gate passes.
//
// Usage:  node generatelanguageskeleton.js --code fi --label Suomi
//
// Creates/extends:
//   lang/<code>.json           uiStrings keys (from en, values ""),
//                              hubNames keys (all languages, values ""),
//                              forms stubs for every core concept
//   <pack>.json ×12            languages.<code> forms stubs (verbs get the
//                              full 6-cell paradigm shape)
// Never overwrites an existing value — safe to re-run.

const fs = require("fs");

const args = process.argv.slice(2);
const code = args[args.indexOf("--code") + 1];
const label = args[args.indexOf("--label") + 1];
if (!code || !label || args.indexOf("--code") === -1 || args.indexOf("--label") === -1) {
  console.error("Usage: node generatelanguageskeleton.js --code <xx> --label <Native name>");
  process.exit(1);
}

const CORE_FILES = [
  "nouns.json", "verbs.json", "adjectives.json", "pronouns.json",
  "numbers.json", "question_words.json", "time_words.json",
  "connectors.json", "directions_positions.json", "glue_words.json",
  "quantifiers.json", "politeness_modality.json",
];
const PACK_FILES = [
  "pokemon.json", "harry_potter.json", "cooking.json", "anime.json",
  "football.json", "music.json", "everyday_life.json", "fashion_style.json",
  "gaming.json", "tourism.json", "space_scifi.json", "fitness.json",
];

const stubFor = (concept) => {
  if (concept.type === "verb") {
    return { base: "", "1_singular": "", "2_singular": "", "3_singular": "",
      "1_plural": "", "2_plural": "", "3_plural": "" };
  }
  if (concept.type === "noun") return { form: "", plural: "" };
  return [""];
};

// lang/<code>.json — core concepts come from the 12 core lexicon files;
// uiStrings/hubNames keys mirror lang/en.json.
const en = JSON.parse(fs.readFileSync("lang/en.json", "utf8"));
const langPath = `lang/${code}.json`;
const langFile = fs.existsSync(langPath)
  ? JSON.parse(fs.readFileSync(langPath, "utf8"))
  : { uiStrings: {}, hubNames: {}, alphabet: { sections: [] }, forms: {} };
for (const k of Object.keys(en.uiStrings)) langFile.uiStrings[k] ??= "";
for (const k of Object.keys(en.hubNames)) langFile.hubNames[k] ??= "";
langFile.hubNames[code] ??= label;
let coreStubs = 0;
for (const file of CORE_FILES) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const concept of data.concepts || []) {
    if (langFile.forms[concept.concept_id] === undefined) {
      langFile.forms[concept.concept_id] = stubFor(concept);
      coreStubs++;
    }
  }
}
fs.writeFileSync(langPath, JSON.stringify(langFile, null, 2) + "\n");
console.log(`${langPath}: ${coreStubs} new core stub(s)`);

// pack files — insert a languages.<code> block textually so the rest of
// the file keeps its exact formatting.
for (const file of PACK_FILES) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (data.languages?.[code]) { console.log(`${file}: ${code} exists, skipped`); continue; }
  const forms = {};
  for (const concept of data.concepts || []) forms[concept.concept_id] = stubFor(concept);
  const src = fs.readFileSync(file, "utf8");
  const anchor = '"languages": {';
  const i = src.indexOf(anchor) + anchor.length;
  const block = JSON.stringify({ label, forms }, null, 2).replace(/\n/g, "\n    ");
  const out = src.slice(0, i) + `\n    "${code}": ` + block + "," + src.slice(i);
  JSON.parse(out); // validity check before writing
  fs.writeFileSync(file, out);
  console.log(`${file}: ${Object.keys(forms).length} stub(s)`);
}

console.log(`\nNext: answer validation/language-profiles.json for "${code}", add the`);
console.log(`languages.js row with hidden: true, author render.${code} for the core`);
console.log("templates, fill the stubs, and iterate `npm run validate:gate` to 85%.");
