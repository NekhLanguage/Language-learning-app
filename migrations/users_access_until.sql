-- Subscription window for Anna (the AI tutor). Applied 2026-09-15.
--
--   NULL        -> no active subscription: the learner can still sign in and
--                  use the app (their `users` row is what grants app entry)
--                  but Anna is greyed out on the start screen.
--   'infinity'  -> permanent subscription.
--   <timestamp> -> subscription active until that instant.
--
-- The Netlify functions read this through the publishable key (the existing
-- "allow select" policy on public.users); nothing client-side writes it.
-- Grant or extend: scripts/grant-access.sh <email> [months|forever].

alter table public.users
  add column if not exists access_until timestamptz;

comment on column public.users.access_until is
  'Anna subscription: NULL = none, infinity = permanent, otherwise active until this instant';
