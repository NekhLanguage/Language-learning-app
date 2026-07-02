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
2. Verify the change on the **Netlify Deploy Preview** for the PR (the
   `netlify/zerotoherolanguage` check on the PR) before merging — CI can't
   see the real Supabase/TTS backends; the preview can.
3. Merge to `main` → production deploy (zerotoherolanguage.netlify.app).

Never commit directly to `main` for app-logic changes.
