-- Anna cost telemetry views (Angus's spec, 2026-09-17). tutor_sessions
-- already holds one row per Anthropic call with the user's email and the
-- estimated cost; these views give the per-user monthly cost and its
-- distribution (p50 / p95 / p99) for the end-of-test-period decision.
-- Applied 2026-09-17 via the Supabase MCP (migration name tutor_cost_views).
-- No usage cap anywhere: measurement only.

create or replace view public.tutor_cost_monthly with (security_invoker = true) as
select user_email,
       to_char(ts at time zone 'UTC', 'YYYY-MM') as month,
       count(*) as calls,
       count(*) filter (where mode = 'chat') as chat_calls,
       sum(tokens_in) as tokens_in,
       sum(tokens_out) as tokens_out,
       sum(cache_read_tokens) as cache_read_tokens,
       sum(cache_write_tokens) as cache_write_tokens,
       sum(cost_est_cents) as cost_cents
from public.tutor_sessions
group by 1, 2;

create or replace view public.tutor_cost_percentiles with (security_invoker = true) as
select month,
       count(*) as users,
       sum(calls) as calls,
       sum(cost_cents) as total_cents,
       round(percentile_cont(0.5) within group (order by cost_cents))::int as p50_cents,
       round(percentile_cont(0.95) within group (order by cost_cents))::int as p95_cents,
       round(percentile_cont(0.99) within group (order by cost_cents))::int as p99_cents,
       max(cost_cents) as max_cents
from public.tutor_cost_monthly
group by month;

revoke all on public.tutor_cost_monthly, public.tutor_cost_percentiles from anon, authenticated;
