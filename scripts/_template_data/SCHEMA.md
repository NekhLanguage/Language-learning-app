# Core sentence-template translation schema

You translate the shared core sentence templates into assigned languages. The
source/anchor data is `scripts/_template_data/_source.json` — an array of 123
templates, each with:
- `template_id`, `concepts` (ordered concept IDs in the sentence)
- `render_en`, `render_pt`, `render_ar` — the full sentence in English/Portuguese/Arabic
- `surface_en`, `surface_pt` — (only on some) a map of concept_id → the exact
  inflected surface word used in that sentence
- `questions` — (only on some) roles (`pronoun`/`verb`/`object`); each has
  `prompt_en`, `prompt_pt`, `choices`, `answer`

For each assigned `<lang>` you write ONE file `scripts/_template_data/<lang>.json`:

```json
{
  "<template_id>": {
    "render": "<full sentence in <lang>>",
    "surface": { "<CONCEPT_ID>": "<inflected surface word in <lang>>", ... },
    "questions": { "<role>": "<translated prompt in <lang>>", ... }
  },
  ...
}
```

## Rules
- An entry for EVERY one of the 123 `template_id`s. `render` is REQUIRED for all.
- `surface` is REQUIRED **only** for templates whose source has `surface_en`
  (otherwise omit `surface`). It must contain the SAME concept_ids as
  `surface_en`, each value being that word as it appears **inflected in your
  render** (e.g. the conjugated verb, the gerund, the article+noun if that's how
  the surface form reads — match the shape/role that `surface_en` shows).
- `questions` is REQUIRED **only** for templates whose source has `questions`
  (otherwise omit). Provide a translated prompt string for EACH role present.
  (Only the prompt is translated — choices/answer are concept IDs, unchanged.)
- Translate the SENSE, with natural grammar: correct conjugation, gender
  agreement, word order, and articles for your language. Use the en/pt/ar
  anchors to disambiguate meaning.
- Pronoun-only "concepts" like FIRST_PERSON_SINGULAR render as the pronoun
  ("I"/"je"/"私は"…); follow how render_en/render_pt express them (some
  pro-drop languages may omit the standalone pronoun in render but should still
  give the pronoun word in `surface`).
- Valid UTF-8 JSON. zh = Simplified characters. No empty strings.

## Verify
After writing, run `node scripts/fill-core-templates.js --check` and confirm
your language is listed ready with 0 problems. Fix anything it reports. Do NOT
edit sentence_templates.json or any file other than your `<lang>.json`.
