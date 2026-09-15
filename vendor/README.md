# Vendored browser libraries

- `supabase-js-2.116.0.umd.js` — `@supabase/supabase-js` 2.116.0, the UMD
  build (`dist/umd/supabase.js`) copied verbatim from the npm tarball. It
  exposes `window.supabase.createClient` and is loaded as a classic script
  by `index.html`, `tutor.html` and `auth.html` before the app modules.
  Vendored rather than pulled from a CDN so the e2e harness stays offline
  and a CDN outage can't take the login screen down. Licence:
  `supabase-js-LICENSE` (MIT).

To upgrade: `npm pack @supabase/supabase-js@<version>`, copy
`package/dist/umd/supabase.js` here under the new file name, and update the
three `<script src="vendor/…">` tags.
