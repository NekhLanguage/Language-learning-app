-- Referral rework (Dan 2026-10-22, with the one-time app): the referrer
-- gets one free month of Anna per friend who buys. Additive only; safe to
-- run before or after the code deploys (the webhook logs and skips the
-- reward until it has run; the referral card counts every referral as a
-- month meanwhile).
--
--   anna_reward_granted_at  when the friend's purchase earned the reward
--                           (stamped by the website's stripe-webhook; at
--                           most once per referral row = once per friend).
--   anna_reward_kind        'window'          30 days added to the
--                                             referrer's access_until
--                           'pending'         referrer subscribes to Anna;
--                                             waiting for referralRewardRun
--                           'invoice_credit'  -$19 invoice item on their
--                                             Anna subscription
--   anna_reward_applied_at  when the reward reached the referrer.

alter table public.referrals
  add column if not exists anna_reward_granted_at timestamptz,
  add column if not exists anna_reward_kind       text
    check (anna_reward_kind in ('window', 'pending', 'invoice_credit')),
  add column if not exists anna_reward_applied_at timestamptz;

create index if not exists referrals_reward_pending_idx
  on public.referrals (anna_reward_granted_at)
  where anna_reward_kind = 'pending' and anna_reward_applied_at is null;

comment on column public.referrals.anna_reward_granted_at is
  'Referral rework 2026-10-22: when this friend''s purchase earned the referrer a free Anna month';
comment on column public.referrals.anna_reward_kind is
  'window | pending | invoice_credit — how the free Anna month reaches the referrer';
comment on column public.referrals.anna_reward_applied_at is
  'When the free Anna month reached the referrer';
