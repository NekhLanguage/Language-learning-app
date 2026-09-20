-- Referral program v1 (Angus's spec, Nekh 2026-09-17): discount-only.
-- Earnings become a negative line on the referrer's next Stripe invoice
-- (never below zero), capped per calendar year (USD, config). No hold
-- window, no customer-balance credit, no cash. Applied 2026-09-17 via the
-- Supabase MCP (migration name referral_v1_discount) on top of
-- referral_program.sql; the tables were empty at the time.

-- commissions: the rate that produced each row, and a status set without
-- the hold/credit/cash states. available = earned, waiting for a run;
-- applied = taken off an invoice (payout_id points at the discount row).
alter table public.commissions add column if not exists rate_bps integer not null default 2000;
alter table public.commissions alter column available_at set default now();
alter table public.commissions drop constraint if exists commissions_status_check;
alter table public.commissions add constraint commissions_status_check
  check (status in ('available','applied','reversed','forfeited'));
alter table public.commissions alter column status set default 'available';

-- payouts: one row per applied discount (kind=discount). 'cash' is kept in
-- the check so a later tier can reuse the table without a rewrite.
alter table public.payouts drop constraint if exists payouts_kind_check;
alter table public.payouts add constraint payouts_kind_check check (kind in ('discount','cash'));
alter table public.payouts add column if not exists period text;      -- YYYY-MM of the run
alter table public.payouts add column if not exists cap_cents integer; -- yearly cap in force at the run
create index if not exists payouts_referrer_created_idx on public.payouts (referrer_email, created_at);

-- Ledger views (bookkeeping vouchers). security_invoker + revoke: the
-- publishable key sees nothing, the secret key (dashboard, functions)
-- sees everything.

-- One row per commission: who referred whom, the payment it came from,
-- the rate, the earning, and when it was applied.
create or replace view public.referral_ledger_detail with (security_invoker = true) as
select c.id as commission_id,
       c.referrer_email,
       r.referred_email,
       r.stripe_subscription_id,
       c.stripe_invoice_id,
       c.earned_at,
       to_char(c.earned_at at time zone 'UTC', 'YYYY-MM') as month,
       c.invoice_amount_cents as payment_received_cents,
       c.rate_bps,
       c.amount_cents as earned_cents,
       c.currency,
       c.status,
       c.payout_id,
       p.period as applied_period,
       p.created_at as applied_at,
       c.note
from public.commissions c
join public.referrals r on r.id = c.referral_id
left join public.payouts p on p.id = c.payout_id;

-- Per referrer, per month: referred subscriptions, payments received,
-- rate, earnings, discount applied, and the running benefit for the year.
create or replace view public.referral_ledger_monthly with (security_invoker = true) as
with earned as (
  select referrer_email,
         to_char(earned_at at time zone 'UTC', 'YYYY-MM') as month,
         count(distinct referral_id) as referred_subscriptions,
         count(*) as invoices,
         coalesce(sum(invoice_amount_cents) filter (where status <> 'reversed'), 0) as payments_received_cents,
         min(rate_bps) as rate_bps_min,
         max(rate_bps) as rate_bps_max,
         coalesce(sum(amount_cents) filter (where status in ('available','applied')), 0) as earned_cents,
         coalesce(sum(amount_cents) filter (where status = 'reversed'), 0) as reversed_cents,
         coalesce(sum(amount_cents) filter (where status = 'forfeited'), 0) as forfeited_cents
  from public.commissions
  group by 1, 2
), applied as (
  select referrer_email,
         to_char(created_at at time zone 'UTC', 'YYYY-MM') as month,
         sum(amount_cents) as discount_applied_cents,
         max(cap_cents) as cap_cents
  from public.payouts
  where kind = 'discount'
  group by 1, 2
), merged as (
  select coalesce(e.referrer_email, a.referrer_email) as referrer_email,
         coalesce(e.month, a.month) as month,
         coalesce(e.referred_subscriptions, 0) as referred_subscriptions,
         coalesce(e.invoices, 0) as invoices,
         coalesce(e.payments_received_cents, 0) as payments_received_cents,
         e.rate_bps_min, e.rate_bps_max,
         coalesce(e.earned_cents, 0) as earned_cents,
         coalesce(e.reversed_cents, 0) as reversed_cents,
         coalesce(e.forfeited_cents, 0) as forfeited_cents,
         coalesce(a.discount_applied_cents, 0) as discount_applied_cents,
         a.cap_cents
  from earned e
  full join applied a on a.referrer_email = e.referrer_email and a.month = e.month
)
select *,
       sum(discount_applied_cents) over (partition by referrer_email, left(month, 4) order by month) as benefit_ytd_cents
from merged;

-- Who is approaching the yearly ceiling.
create or replace view public.referral_benefit_ytd with (security_invoker = true) as
select referrer_email,
       extract(year from created_at at time zone 'UTC')::int as year,
       sum(amount_cents) as discount_applied_cents,
       max(cap_cents) as cap_cents,
       max(cap_cents) - sum(amount_cents) as remaining_cents,
       count(*) as runs
from public.payouts
where kind = 'discount'
group by 1, 2;

revoke all on public.referral_ledger_detail, public.referral_ledger_monthly, public.referral_benefit_ytd
  from anon, authenticated;
