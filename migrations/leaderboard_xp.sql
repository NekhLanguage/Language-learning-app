-- Leaderboard fix (Dan 2026-10-25 freeze exception, metric Nekh 2026-10-25).
-- The board ranked words mastered at level 7, which a new learner can't
-- reach for weeks: on 2026-10-25, 2 of 22 accounts had any score. It now
-- ranks experience points, and new accounts join it under a generated
-- handle. Additive only; safe to run before or after the code deploys
-- (saveUser falls back to the old counters, the board 503s not_migrated,
-- and checkAccess skips enrolment until it has run).
--
--   lb_xp                 every level a word clears is 1 XP, clearing
--                         level 7 is 3 (a mastered word = 9), summed across
--                         runs. Recomputed by saveUser on every save
--                         (leaderboardStats.js countXp); backfilled below
--                         with the same rule so the board is right on day
--                         one. lb_words (mastery) and lb_anna stay.
--   lb_enroll_checked_at  when checkAccess put the account on the board
--                         under a generated handle. NULL = not yet: only
--                         rows created after this migration. Existing rows
--                         are stamped now, so nobody already here is put
--                         on the board without choosing to (Dan: "existing
--                         opted-in names stay as they are").

alter table public.users add column if not exists lb_xp integer not null default 0;
alter table public.users add column if not exists lb_enroll_checked_at timestamptz;

update public.users u set lb_xp = coalesce((
  select sum(
    case when floor((p.value->>'level')::numeric) < 1 then 0
    else (floor((p.value->>'level')::numeric) - 1)
      + case when (p.value->>'completed') = 'true'
             then case when floor((p.value->>'level')::numeric) >= 7 then 3 else 1 end
             else 0 end
    end)
  from jsonb_each(case when jsonb_typeof(u.data->'runs') = 'object' then u.data->'runs' else '{}'::jsonb end) r,
       jsonb_each(case when jsonb_typeof(r.value->'progress') = 'object' then r.value->'progress' else '{}'::jsonb end) p
  where jsonb_typeof(p.value) = 'object' and (p.value->>'level') ~ '^[0-9]+(\.[0-9]+)?$'
), 0)
where u.data is not null;

update public.users set lb_enroll_checked_at = now() where lb_enroll_checked_at is null;

create index if not exists users_lb_xp_idx
  on public.users (lb_xp desc) where lb_name is not null;

comment on column public.users.lb_xp is
  'Leaderboard ranking: 1 XP per level a word clears, 3 for clearing level 7, across all runs (recomputed on every save)';
comment on column public.users.lb_enroll_checked_at is
  'Leaderboard: when the account was auto-enrolled under a generated handle (NULL = new account, not yet)';
