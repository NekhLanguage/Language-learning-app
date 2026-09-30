-- Free tier (Nekh 2026-09-30): lessons 1-3 free behind an email account,
-- paywall at lesson 4, Anna fully paywalled. Additive only: every existing
-- row keeps access_tier NULL, which the functions treat exactly as before
-- (full app, Anna by access_until). Safe to run before the code deploys.
--
--   access_tier         NULL  = pre-free-tier row (paying / granted), unchanged
--                       'trial' = free account (checkAccess creates it on the
--                                 first verified sign-in of an email with no row)
--                       'paid'  = converted (stripe-webhook) or granted by hand
--   trial_started_at    when the free-tier row was created
--   converted_at        when stripe-webhook moved the row trial -> paid
--   anna_month_free_at  set with converted_at: the first $19 includes the
--                       first month of Anna (the first invoice's period IS
--                       that month; no extra free time is added in Stripe)
--
-- site_events.props carries event detail (trial_lesson_complete's lesson
-- index); the app's functions write these rows with the secret key.

alter table public.users add column if not exists access_tier text;
alter table public.users add column if not exists trial_started_at timestamptz;
alter table public.users add column if not exists converted_at timestamptz;
alter table public.users add column if not exists anna_month_free_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_access_tier_check') then
    alter table public.users
      add constraint users_access_tier_check
      check (access_tier is null or access_tier in ('trial', 'paid'));
  end if;
end $$;

comment on column public.users.access_tier is
  'Free tier: NULL = pre-free-tier row (unchanged), trial = lessons 1-3 only and no Anna, paid = converted or granted';

alter table public.site_events add column if not exists props jsonb;
