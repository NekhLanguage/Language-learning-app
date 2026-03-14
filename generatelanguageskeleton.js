const fs = require("fs");

const LANG_CODE = "ko";
const LABEL = "Korean";

const files = [
  "adjectives.json",
  "connectors.json",
  "directions_positions.json",
  "glue_words.json",
  "nouns.json",
  "numbers.json",
  "politeness_modality.json",
  "pronouns.json",
  "quantifiers.json",
  "question_words.json",
  "time_words.json",
  "verbs.json"
];

files.forEach(file => {

  const data = JSON.parse(fs.readFileSync(file, "utf8"));

  if (data.languages[LANG_CODE]) {
    console.log(file + " already has " + LANG_CODE);
    return;
  }

  const forms = {};

  data.concepts.forEach(c => {

    if (c.type === "verb") {
      forms[c.concept_id] = { base: "" };
    }
    else if (c.type === "noun") {
      forms[c.concept_id] = { form: "" };
    }
    else {
      forms[c.concept_id] = [""];
    }

  });

  data.languages[LANG_CODE] = {
    label: LABEL,
    forms
  };

  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  console.log("Added skeleton for", LANG_CODE, "to", file);

});