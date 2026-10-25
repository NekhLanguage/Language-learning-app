-- Leaderboard: enroll the existing accounts (Nekh-decided 2026-10-25 11:23,
-- Dan 11:30). Run AFTER leaderboard_xp.sql and leaderboard_weekly.sql.
-- One-off, additive, safe to run twice.
--
-- Who: the accounts that existed when leaderboard_xp.sql ran. That
-- migration stamped every row with ONE lb_enroll_checked_at value
-- (2026-10-25 10:32:57.032226+00 on production), so that value marks the
-- cohort exactly. Of them, every account not yet on the board
-- (lb_name IS NULL) and not a test account (lb_excluded = false) gets a
-- handle. The two learners who had already picked a name, and the
-- test accounts, keep what they have.
--
-- Handles: the same positive adjective + animal lists as
-- netlify/functions/leaderboardNames.js ("Brave Otter"), shuffled, each
-- one used once, and never one already taken (case-insensitive, as the
-- users_lb_name_unique index compares).
--
-- Safe twice: the second statement re-stamps the whole cohort with the
-- run time, so a second run finds no row with the old stamp and changes
-- nothing. That includes anyone who left the board in between, who stays
-- off. Accounts created later carry their own stamp, set by autoEnroll,
-- and are never touched here. Rename and leave keep working as built.

begin;

with cohort_stamp as (
  select timestamptz '2026-10-25 10:32:57.032226+00' as at
),
adjectives(word) as (
  select unnest(array['Brave', 'Bright', 'Calm', 'Cheerful', 'Clever', 'Curious', 'Daring', 'Eager',
    'Friendly', 'Gentle', 'Glad', 'Golden', 'Happy', 'Helpful', 'Hopeful', 'Jolly',
    'Kind', 'Lively', 'Lucky', 'Merry', 'Mighty', 'Noble', 'Patient', 'Plucky',
    'Proud', 'Quick', 'Radiant', 'Sharp', 'Smart', 'Steady', 'Sunny', 'Swift',
    'Bold', 'Tireless', 'Upbeat', 'Valiant', 'Warm', 'Wise', 'Witty', 'Zesty'])
),
animals(word) as (
  select unnest(array['Badger', 'Bear', 'Beaver', 'Bison', 'Cat', 'Crane', 'Deer', 'Dolphin',
    'Eagle', 'Falcon', 'Fox', 'Gecko', 'Hare', 'Hawk', 'Hedgehog', 'Heron',
    'Koala', 'Lark', 'Lion', 'Lynx', 'Moose', 'Otter', 'Owl', 'Panda',
    'Parrot', 'Penguin', 'Puffin', 'Rabbit', 'Raven', 'Robin', 'Seal', 'Sparrow',
    'Squirrel', 'Swan', 'Tiger', 'Turtle', 'Walrus', 'Whale', 'Wolf', 'Yak'])
),
free_handles as (
  select a.word || ' ' || n.word as handle,
         row_number() over (order by random()) as slot
  from adjectives a cross join animals n
  where not exists (
    select 1 from public.users u
    where u.lb_name is not null and lower(u.lb_name) = lower(a.word || ' ' || n.word)
  )
),
targets as (
  select u.email, row_number() over (order by random()) as slot
  from public.users u, cohort_stamp c
  where u.lb_enroll_checked_at = c.at
    and u.lb_name is null
    and u.lb_excluded = false
)
update public.users u
set lb_name = h.handle,
    lb_enroll_checked_at = now()
from targets t
join free_handles h on h.slot = t.slot
where u.email = t.email;

-- Close the cohort: the rest of it (the two opted-in names, the test
-- accounts) gets the run time too, so a second run is a no-op.
update public.users
set lb_enroll_checked_at = now()
where lb_enroll_checked_at = timestamptz '2026-10-25 10:32:57.032226+00';

commit;
