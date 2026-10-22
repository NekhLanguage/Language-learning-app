-- Anna subscription (Dan 2026-10-22, pricing rebuild PR A).
--
-- The app becomes a one-time $19 purchase; Anna becomes an opt-in monthly
-- subscription. The existing `access_until` column stays as Anna's live
-- window (NULL / 'infinity' / timestamptz — see users_access_until.sql).
-- These six timestamps let the client (and later analysis) reason about
-- the trial lifecycle without inferring it from `access_until` alone.
--
--   anna_trial_started_at   first stamped by the website's stripe-webhook
--                           when a one-time purchase lands.
--   anna_trial_ends_at      anna_trial_started_at + interval '1 month'.
--   anna_subscribed_at      first stamped by the Anna-subscription webhook
--                           when the opt-in checkout confirms.
--   anna_popup_welcome_at   stamped once per threshold on first sign-in
--   anna_popup_5day_at      after crossing it. Guarantees once-per-threshold
--   anna_popup_1day_at      even when the learner signs in on two devices.
--
-- Additive only — no row data touched. Safe to apply ahead of PR B.

alter table public.users
  add column if not exists anna_trial_started_at timestamptz,
  add column if not exists anna_trial_ends_at    timestamptz,
  add column if not exists anna_subscribed_at    timestamptz,
  add column if not exists anna_popup_welcome_at timestamptz,
  add column if not exists anna_popup_5day_at    timestamptz,
  add column if not exists anna_popup_1day_at    timestamptz;

comment on column public.users.anna_trial_started_at is
  'Anna free month: when the trial window started (set by the Stripe webhook on one-time purchase).';
comment on column public.users.anna_trial_ends_at is
  'Anna free month: when the trial window ends. Billing on opt-in before this instant is dated at this instant.';
comment on column public.users.anna_subscribed_at is
  'Anna subscription: when the learner opted in. NULL = never opted in.';
comment on column public.users.anna_popup_welcome_at is
  'Pricing-rebuild popup: welcome popup shown on first sign-in after purchase. Once per account.';
comment on column public.users.anna_popup_5day_at is
  'Pricing-rebuild popup: 5-days-left reminder shown on first sign-in after crossing the threshold. Once per account.';
comment on column public.users.anna_popup_1day_at is
  'Pricing-rebuild popup: 1-day-left reminder shown on first sign-in after crossing the threshold. Once per account.';
