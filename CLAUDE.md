# Zero to Hero — developer notes

A vanilla-JS (no framework) static web app deployed on Netlify. `app.js` drives a
single-page learning flow; `sentence_engine.mjs` generates sentences from JSON
vocab packs + templates; `progression.mjs` holds the mastery-ladder rules;
`storage.mjs` holds user-state versioning/recovery; serverless functions live in
`netlify/functions/` (Supabase persistence, Google Cloud TTS).

## Running the app locally

```
npm run dev            # http://127.0.0.1:8888
PORT=3000 npm run dev  # custom port
```

`tests/dev-server.mjs` is a zero-dependency server that serves the static files
with correct MIME types and **stubs every `/.netlify/functions/*` endpoint**, so
the app runs fully offline — no Supabase, no Google TTS credentials needed.

- Log in with any email (e.g. `test@example.com`). An email containing
  `noaccess` is rejected, which exercises the no-access path.
- Saved user blobs round-trip in memory: `saveUser` → `loadUser` works within
  one server run. Inspect them at `GET /__devserver/users`.
- TTS returns a tiny silent MP3 so audio playback resolves instantly.

## Checks — run all of these before pushing

```
npm run lint       # ESLint — bug-class rules (no-undef etc.) are errors;
                   # legacy unused-var findings are warnings and don't block
npm run test:unit  # node:test unit tests (engine rules, progression, storage)
npm run test:e2e   # Playwright end-to-end tests against the offline harness
npm run validate   # content validators: structure, templates, exercises,
                   # pack completeness, generated-sentence regression baseline
```

CI (`.github/workflows/validate.yml`) runs all four on every push and PR.
Nothing merges red.

### E2e tests

E2e tests live in `tests/e2e/`. They start the dev server themselves (port
8899) — no setup needed. Every test automatically fails on any console error,
uncaught page error, failed request, or 4xx/5xx response (see
`tests/e2e/fixtures.mjs`). Playwright uses a preinstalled Chromium when
`/opt/pw-browsers/chromium` exists (remote/CI images) or `PW_CHROMIUM_PATH`;
otherwise run `npx playwright install chromium` once.

Test hooks in `app.js` (keep these working):
- `window.__app` — exposes the live `run`, `bundleIndex`, `lastExercise`
  (expected answer for L6/L7), and `rerender()`; the level tests seed
  progress through it.
- `data-cid` attributes on exercise option buttons (L2–L5) identify the
  concept each option represents.

### Content changes

`validation/validate-sentences.mjs` runs the real sentence engine over every
template × language and compares findings against
`validation/sentence-baseline.json`; new findings fail CI, fixed ones can be
removed with `npm run validate:sentences:update`.

`validation/validate-injection.mjs` exercises the modifier-INJECTION paths
(random adjectives/numbers) that the render validators never see — mass-noun
guards, plural-data completeness, forced-injection render lints (L3 blank
contract, spaceless-script spacing) — ratcheted via
`validation/injection-baseline.json` (`npm run validate:injection:update`).

`validation/validate-exercise-surfaces.mjs` walks EXERCISE ASSEMBLY per
language — the layer the sentence validators never see (Italian shipped four
high bugs there with every validator green): the L3 blank partition contract,
option-set surface distinctness, the L7 accepted-answer/modifier-parity
contract, a per-language inventory of silently-untestable concepts, and
case-field fallbacks in case-marking languages — ratcheted via
`validation/surface-baseline.json` (`npm run validate:surface:update`). Its
hubNames completeness check is a hard fail, never baselined.

`validation/validate-grammar-coverage.mjs` is the **grammar coverage
matrix**: every language's `language_rules.mjs` row declares `features` —
linguistic facts about what the language NEEDS (case on objects, adjective
declension, adjective position, apocope, …) — and the validator fails when
a declared need has no implementing rule/data. Ratcheted via
`validation/grammar-coverage-baseline.json` (`npm run
validate:coverage:update`): the baseline is the owner-visible list of
known-unimplemented grammar per language. Hard fails (never baselined): an
implementing flag with no declared feature (stale matrix), and any gap in
a launch-verified language (pl, uk). This is what turns "has a rules row"
into "has the RIGHT row" — de/fr/es shipped broken with green CI because
only row existence was checked.

`validation/validate-render-divergence.mjs` compares every generated sentence
against the human-authored `render` strings (the native-speaker ground truth)
and ratchets the result via `validation/render-divergence-baseline.json`: any
NEW divergence fails CI, fixed ones can be pruned with
`npm run validate:divergence:update`. `validation/report-render-divergence.mjs
--lang <code>` lists every current divergence for one language — that list is
the priority queue for engine grammar work.

### Adding a new language

The engine renders the TARGET language from concept data — an unhandled
grammar feature produces wrong sentences silently (this shipped «Я п'ю вода»
for Ukrainian). Work through this list; don't skip to "the app boots":

1. **Author the ground truth first.** Fill `render.<code>` (and
   `surface.<code>`) for every core template in `sentence_templates.json`,
   written/reviewed by a native speaker. Pack files also need per-language
   `forms` — `npm run validate` enforces completeness.
2. **Declare the language's grammar rules AND its `features` block in
   `language_rules.mjs`** — both are enforced: the unit suite fails if a
   shipped language has no rules row or no features block, and
   `validate-grammar-coverage` fails when a declared feature (what the
   language NEEDS) has no implementing rule. Write the features block
   FIRST, from linguistic facts — it is the checklist the validator then
   holds you to. Audit the grammar features the language needs against the flags
   that exist (indefinite article, adjective order, possessive articles,
   zero copula, pro-drop, spaceless script) and against the engine
   features they drive: articles (`nounPhrase`, `definiteNounPhrase`),
   gender + agreement (`gender`, `f`/`n`/`plural`/`fp` fields), noun case
   (uk-style `accusative`/`genitive`/`locative`/`instrumental` fields +
   engine mapping), word order (`WORD_ORDER`), script/punctuation
   (`finalizeSentence`), counters/particles (ja). Per-word exceptions have
   flags: `noArticle`, `pluralOnly`, `invariantPlural`, `predicative`,
   `article`, `noArticleWithPossessive`. A grammar behaviour the flags
   can't express means a NEW flag plus a rule implementation the other
   languages can also declare — never an `if (lang === "xx")` buried in a
   render path, and never a rule that fires on one render path but not
   the others (the Italian launch shipped «suo taxi» exactly that way).
   Add per-language behaviour tests to
   `tests/unit/language_rules.test.mjs` for every flag you set.
3. **Run `npm run validate:divergence` AND `npm run validate:injection`** and read every finding for the
   new language. Fix what the engine/data can express; only then baseline the
   rest with `npm run validate:divergence:update`. The baseline diff in your
   PR is the reviewable list of known-imperfect sentences learners will see —
   a high rate is a launch decision someone should sign off on, not a
   surprise.
4. **Grammar notes**: every rule id in `GRAMMAR_RULE_IDS` needs a note in the
   new language (`grammar_notes.json`) — `validate-grammar-notes` enforces it.
5. **Gate AI features** for the language in `capabilities.mjs` until verified.
6. Drive the real app once with the language selected (see `tests/e2e/` for
   the harness) and read the sentences on L1–L7 like a learner would.

### Changing the shape of user state

The persisted `USER` blob (localStorage `zth_user`, mirrored to Supabase) is
versioned. If you change its shape:
1. Bump `CURRENT_SCHEMA_VERSION` in `storage.mjs`.
2. Add a numbered migration block to `migrateUserState()` that upgrades
   older blobs — it must be safe on state written by any previous version.
3. Add a unit test in `tests/unit/storage.test.mjs`.

A boot-time backup (`zth_user_backup`) plus `recoverUser()` protect learners
from corrupt blobs — never bypass `loadUser()`/`saveUser()` with direct
localStorage writes to `zth_user`.

## Release flow

1. Branch, commit, push, open a PR. CI must be green.
   - If app.js or any data JSON (templates, packs, lang files, notes)
     changed, bump `APP_DATA_VERSION` in app.js AND the matching
     `app.js?v=` in index.html (same version string) so browsers can't
     serve stale cached code or data across the deploy.
   - `tutor.js?v=` in tutor.html carries the SAME string as
     `APP_DATA_VERSION`, on every ship, whether or not tutor.js changed
     (Nekh 2026-09-03). If tutor.js changed but nothing app-side did, set
     it to the current `APP_DATA_VERSION` without bumping the app.
2. Verify the change on the **Netlify Deploy Preview** for the PR (the
   `netlify/zerotoherolanguage` check on the PR) before merging — CI can't
   see the real Supabase/TTS backends; the preview can.
3. Merge to `main` → production deploy (zerotoherolanguage.netlify.app).

Never commit directly to `main` for app-logic changes.
