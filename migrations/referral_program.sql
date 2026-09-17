-- Referral program (Nekh 2026-09-17). Applied 2026-09-17 via the Supabase MCP
-- (migration name referral_program). 20% of every payment a referred
-- subscriber makes, to the referrer, for as long as both stay subscribed.
-- Written only with the secret key: NO anon policies (commissions are money).
-- Writers: the website's stripe-webhook.ts (attribution, commissions,
-- reversals, referral end) and the app's referral.js (codes, stats).

create table if not exists public.referral_codes (
  email             text primary key references public.users(email) on delete cascade,
  code              text not null unique,
  accepted_terms_at timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create table if not exists public.referrals (
  id                     bigserial primary key,
  referrer_email         text not null references public.referral_codes(email),
  referred_email         text not null unique,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  code_used              text not null,
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  status                 text not null default 'active' check (status in ('active','ended','voided'))
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_email);

create table if not exists public.commissions (
  id                   bigserial primary key,
  referral_id          bigint not null references public.referrals(id),
  referrer_email       text not null,
  stripe_invoice_id    text not null unique,
  stripe_charge_id     text,
  invoice_amount_cents integer not null,
  amount_cents         integer not null,
  currency             text not null,
  earned_at            timestamptz not null default now(),
  available_at         timestamptz not null,
  status               text not null default 'pending'
                       check (status in ('pending','available','credited','paid','reversed','forfeited')),
  payout_id            bigint,
  note                 text
);
create index if not exists commissions_referrer_status_idx on public.commissions (referrer_email, status);

create table if not exists public.payouts (
  id               bigserial primary key,
  referrer_email   text not null,
  amount_cents     integer not null,
  currency         text not null,
  kind             text not null check (kind in ('credit','cash')),
  stripe_reference text,
  created_at       timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;
alter table public.commissions    enable row level security;
alter table public.payouts        enable row level security;
