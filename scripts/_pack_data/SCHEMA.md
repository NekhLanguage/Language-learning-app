# Translation data schema (read carefully)

You are authoring vocabulary translations for a language-learning app. For each
assigned pack + language you produce ONE file:

`scripts/_pack_data/<pack>.<lang>.json`

with this exact top-level shape:

```json
{ "label": "<Language name in English>", "forms": { "CONCEPT_ID": <entry>, ... } }
```

`forms` MUST contain an entry for EVERY concept_id in the pack's source file
`scripts/_pack_data/_source/<pack>.source.json` (read it for the concept list,
type of each concept, and reference translations in en/es/pt/de/ja anchors).

Language label values: fr="French", zh="Chinese", de="German", el="Greek", tr="Turkish".

## Entry shape by concept `type`

**noun**
- fr: `{ "form": "<lowercase noun>", "gender": "m"|"f", "plural": "<plural>" }`
- de: `{ "form": "<Capitalized noun>", "gender": "m"|"f"|"n", "plural": "<plural>" }`
- el: `{ "form": "<Greek noun>", "gender": "m"|"f"|"n", "plural": "<plural>" }`
- tr: `{ "form": "<Turkish noun>", "plural": "<plural, vowel-harmony correct>" }`  (NO gender)
- zh: `{ "form": "<Simplified Chinese>" }`  (no gender/plural/article)

**verb** — give base + the 6 present-tense conjugations (order: 1/2/3 singular, 1/2/3 plural)
- fr: `{ "base": "<infinitive>", "1_singular": "...", "2_singular": "...", "3_singular": "...", "1_plural": "...", "2_plural": "...", "3_plural": "..." }`
- de: same 6 keys + base (present indicative)
- el: `base` = 1st-person-singular present (Greek citation form), plus the 6 keys
- tr: `base` = `-mek/-mak` infinitive, plus the 6 keys (use the aorist/geniş present)
- zh: `{ "base": "<verb>" }`  (Chinese verbs do not conjugate)

**adjective** — single-element array, masculine singular for gendered languages:
- all langs: `[ "<word>" ]`

**measure** (cooking only) — `{ "form": "<word>" }` for every language.

## Rules
- Every concept_id present, no empty strings, valid JSON (UTF-8).
- Use the en/es/pt/de/ja anchors in the source file to fix meaning; translate the
  SENSE in this pack's domain (e.g. football "PITCH" = the field, not tone/tar).
- Proper nouns / loanwords (e.g. Pokémon, Hogwarts-world terms): use the
  established native-market term where one exists; otherwise a sensible
  transliteration. zh uses Simplified characters.
- Do NOT edit the pack .json files themselves — only write your data file(s).
- After writing, verify with: `node scripts/fill-pack-translations.js --check`
  (it reports any missing/empty concepts for your files).
