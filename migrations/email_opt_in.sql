-- Email consent for free-tier signups (Austin via Nekh, 2026-10-04).
--
-- The sign-up screen never asked permission to email, and Norwegian
-- marketing law needs an opt-in before an address can go on the
-- newsletter or into a sales sequence. Two timestamps, both NULL by
-- default; additive, safe to run before the code deploys.
--
--   email_opt_in_at        when the learner ticked "Send me Nekh's weekly
--                          email" (the proof of consent). NULL = no consent:
--                          the address never reaches MailerLite.
--   email_opt_in_asked_at  when the question was put to them (the sign-up
--                          form, or the one-time screen after a first Google
--                          sign-in), ticked or not. NULL = never asked, so a
--                          returning Google learner is asked once and only once.
--
-- No backfill: every existing row stays NULL on both (nessd0612 included).

alter table public.users add column if not exists email_opt_in_at timestamptz;
alter table public.users add column if not exists email_opt_in_asked_at timestamptz;

comment on column public.users.email_opt_in_at is
  'Marketing-email consent: when the learner ticked the weekly-email box; NULL = no consent, never sent to MailerLite';
comment on column public.users.email_opt_in_asked_at is
  'When the weekly-email question was shown (sign-up form or first Google sign-in); NULL = never asked';
