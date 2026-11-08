-- Signup source tagging (Dan, Nekh-approved, 2026-11-08 — Freeze exception #3).
--
-- The app couldn't tell where a trial user came from: the gate reads
-- ?start=free and nothing else. Videos go live Mon and Thu with the free
-- lessons as the call to action; Facebook group posts and the expo QR code
-- also point at the app. Without a tag, no channel attribution.
--
-- Additive, safe to run twice. Nothing visible to the learner changes.
--
--   signup_source  the sanitised ?source= (or utm_source fallback) that
--                  survived the OAuth round-trip at the point the trial row
--                  was created. NULL for every existing row and for every
--                  future row that lands without a tag. Never overwritten
--                  once set (write path uses INSERT on_conflict=ignore).
--
-- Expected tag shapes (client sanitiser enforces [a-z0-9_-]{1,40}):
--   yt-v<NN>       per video            fb-<group>    facebook post
--   expo           expo QR code         newsletter    beehiiv list
--
-- Dan reads this column with SQL; no dashboard, no UI.

alter table public.users add column if not exists signup_source text;

comment on column public.users.signup_source is
  'Sanitised first-touch ?source= (or utm_source) at free-tier row creation; NULL = unknown; never overwritten';
