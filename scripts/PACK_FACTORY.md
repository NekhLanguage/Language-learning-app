# Pack Factory — how to produce a new resource pack

A repeatable, validator-gated pipeline for adding a themed vocabulary pack
(like `cooking` or `everyday_life`). AI authors the content; CI decides
whether it ships. Every step below is enforced by `npm run validate` unless
marked (manual).

The 13 languages: `en, pt, ar, de, el, ja, ko, no, tr, uk, es, fr, zh`.

## 0. Pick the theme (manual)

~50 concepts: ≈ 25–30 nouns, ~12 verbs, ~9–10 adjectives (the
`everyday_life` split). Concept ids are UPPER_SNAKE and must be **globally
unique** across every vocab file — check against the merged set:

```
node --input-type=module -e "import {loadVocab} from './validation/load-vocab.mjs'; console.log(Object.keys(loadVocab().concepts).sort().join('\n'))"
```

## 1. Author `<pack>.json`

```json
{
  "concepts": [ { "concept_id": "TREADMILL", "type": "noun" }, ... ],
  "languages": { "en": { "label": "English", "forms": { ... } }, ... all 13 ... }
}
```

Concept flags: `"countable": false` (mass nouns — no article/plural),
`"invariantPlural": true` (plural = singular), `"semantic_role": "abstract"`
for non-physical nouns. Do NOT give adjectives restrictive `semantic_role`s
(`property_color` etc.) unless you know the template implications.

Per-language entry shapes (full detail in `scripts/_pack_data/SCHEMA.md`):

| lang | noun | verb | adjective |
|------|------|------|-----------|
| en | `form` + `article` ("a"/"an"; omit if mass) | `base` + `3_singular` | `["form"]` |
| pt, es, fr | `form`, `gender` (m/f), `plural` | `base` + 6-person paradigm | `["form"]` |
| de | `form`, `gender` (m/f/n), `plural` | `base` + 6-person | `["form"]` |
| el | `form`, `gender` (m/f/n), `plural` | `base` (1sg citation) + 6-person | `{form, f, n}` |
| uk | `form`, `gender` (m/f/n), `plural` | `base` + 6-person | `["form"]` |
| ar | `form`, `gender` (m/f) — no plural | `base` + 6-person | `{form, f}` |
| no | `form`, `gender` (m/f/n), `plural` | `base` + `present` | `["form"]` |
| tr | `form` (no gender) | `base` (-mek/-mak) + 6-person | `["form"]` |
| ja, ko, zh | `form` | `base` only | `["form"]` |

6-person paradigm keys (exact): `1_singular, 2_singular, 3_singular,
1_plural, 2_plural, 3_plural`. Gender is a hard error if missing on
uk/el/ar nouns and a warning on de/pt/fr/es — fill it everywhere.

## 2. Author `sentence_templates_<pack>.json`

~60–75 **render-only** templates: `{ "template_id", "concepts", "render": { "en" } }`.
No `questions`, no `surface`, no `structure` — packs synthesize exercise
options at runtime. Combine pack words with core pronouns
(`FIRST_PERSON_SINGULAR`, `SECOND_PERSON`, `HE`, `SHE`, `FIRST_PERSON_PLURAL`,
`THIRD_PERSON_PLURAL`) and core verbs (`SEE`, `HAVE`, `BE`). Cover every pack
concept in several templates across different subjects and frames
(SVO, intransitive, copular `BE`+adjective / `BE`+noun). `render.en` must be
exactly what the engine generates (correct a/an, capital start, final period).

## 3. Register (3 edits)

1. `app.js` → `RESOURCE_PACKS`: add
   `mypack: { vocabFile, templateFile, beta: true, bundles: [ { id: "mp_01", concepts: [5 ids] }, … 10 bundles ] }`.
   Convention: bundles grouped by type — nouns first, verbs mid, adjectives last.
2. `app.js` → `VOCAB_FILES`: append `"mypack.json"`.
3. `validation/load-vocab.mjs` → `VOCAB_FILES`: append `"mypack.json"`.

## 4. Validate until green

```
npm run validate    # pack completeness, template refs, engine renders x13
npm run lint && npm run test:unit && npm run test:e2e
```

`validate-sentences.mjs` runs the real engine over every template × all 13
languages; any new LEAK / EMPTY / EN_GRAMMAR / MISSING_WORD finding fails CI.
Fix the data rather than updating the baseline unless the finding is a known,
accepted quirk (`npm run validate:sentences:update`).

## 5. Review gates (manual)

- New packs ship `beta: true` (BETA badge) until a native-speaker pass per
  language de-flags them.
- Verify on the Netlify Deploy Preview before merging: select the pack,
  play a session, tap TTS on a few words in non-Latin scripts.
