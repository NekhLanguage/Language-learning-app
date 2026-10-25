-- Leaderboard weekly tab (Nekh 2026-10-08): what each learner gained THIS
-- week (ISO week, Monday 00:00 UTC), next to the all-time counters.
--
-- 2026-10-25: tracks XP (lb_xp) instead of words mastered, with the board's
-- new ranking — run migrations/leaderboard_xp.sql FIRST. This file had not
-- been applied on production (no lb_week column on 2026-10-25), so it was
-- edited in place rather than followed by a second migration.
-- Additive only; safe to run before the code deploys (the leaderboard
-- function answers the weekly view with 503 not_migrated until it has run,
-- and nothing else reads these columns).
--
--   lb_week        the ISO week the weekly counters belong to ("2026-W41").
--   lb_xp_base  lb_xp at the start of that week (the value before the
--   lb_anna_base   learner's first save of the week), likewise lb_anna.
--   lb_xp_week  lb_xp / lb_anna gained this week: current minus base,
--   lb_anna_week   never below 0 (a reset can't make a week negative).
--
-- saveUser already writes lb_xp / lb_anna on every save; this trigger
-- does the weekly bookkeeping in the same UPDATE, so the save path gains no
-- round-trip and the app nothing at boot. A learner who hasn't saved this
-- week still carries last week's lb_week and is left out of this week's
-- board (their gain is 0).

alter table public.users add column if not exists lb_week text;
alter table public.users add column if not exists lb_xp_base integer not null default 0;
alter table public.users add column if not exists lb_anna_base integer not null default 0;
alter table public.users add column if not exists lb_xp_week integer not null default 0;
alter table public.users add column if not exists lb_anna_week integer not null default 0;

create or replace function public.users_lb_weekly() returns trigger
language plpgsql set search_path = '' as $$
declare
  wk text := to_char((now() at time zone 'utc'), 'IYYY-"W"IW');
begin
  if OLD.lb_week is distinct from wk then
    NEW.lb_week := wk;
    -- A row whose counters were never computed (lb_updated_at NULL) still
    -- holds the 0 defaults: its first real count is not this week's gain.
    if OLD.lb_updated_at is null then
      NEW.lb_xp_base := coalesce(NEW.lb_xp, 0);
      NEW.lb_anna_base := coalesce(NEW.lb_anna, 0);
    else
      NEW.lb_xp_base := coalesce(OLD.lb_xp, 0);
      NEW.lb_anna_base := coalesce(OLD.lb_anna, 0);
    end if;
  end if;
  NEW.lb_xp_week := greatest(0, coalesce(NEW.lb_xp, 0) - NEW.lb_xp_base);
  NEW.lb_anna_week := greatest(0, coalesce(NEW.lb_anna, 0) - NEW.lb_anna_base);
  return NEW;
exception when others then
  -- Bookkeeping must never block a learner's save.
  raise warning 'users_lb_weekly: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists users_lb_weekly on public.users;
create trigger users_lb_weekly
  before update of lb_xp, lb_anna on public.users
  for each row execute function public.users_lb_weekly();

-- The weekly board reads: top N this week among learners who joined.
create index if not exists users_lb_xp_week_idx
  on public.users (lb_week, lb_xp_week desc) where lb_name is not null;
create index if not exists users_lb_anna_week_idx
  on public.users (lb_week, lb_anna_week desc) where lb_name is not null;

comment on column public.users.lb_week is
  'Leaderboard: ISO week (UTC) the *_week counters belong to, e.g. 2026-W41';
comment on column public.users.lb_xp_week is
  'Leaderboard: lb_xp gained in lb_week (maintained by trigger users_lb_weekly)';
comment on column public.users.lb_anna_week is
  'Leaderboard: lb_anna gained in lb_week (maintained by trigger users_lb_weekly)';
