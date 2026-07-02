# Zero to Hero — developer notes

A vanilla-JS (no framework) static web app deployed on Netlify. `app.js` drives a
single-page learning flow; `sentence_engine.mjs` generates sentences from JSON
vocab packs + templates; serverless functions live in `netlify/functions/`
(Supabase persistence, Google Cloud TTS).

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

## Checks

```
npm run validate   # content validators: structure, templates, exercises,
                   # pack completeness, generated-sentence regression baseline
```

`validation/validate-sentences.mjs` runs the real sentence engine over every
template × language and compares findings against `validation/sentence-baseline.json`;
new findings fail, fixed ones can be removed with `npm run validate:sentences:update`.
