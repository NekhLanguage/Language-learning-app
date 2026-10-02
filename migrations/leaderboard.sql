-- Leaderboard v1 (Nekh 2026-10-02): two community counters per learner,
-- words mastered at level 7 and words encountered with Anna, shown under an
-- opt-in display name. Additive only; safe to run before the code deploys
-- (saveUser retries without the lb_ columns if they are missing, and the
-- leaderboard function 503s cleanly).
--
--   lb_name        the learner's chosen public name; NULL = not on the board.
--                  Nothing is shown for a row until the learner picks one.
--   lb_words       concepts with completed = true at level 7, summed across
--                  every language run. Recognition-only concepts (capped at
--                  level 4) never count.
--   lb_anna        words encountered with Anna: tutor-admitted concepts plus
--                  the captured personalVocab / pendingAdmission lists,
--                  summed across runs (the same tally the tutor's own
--                  "284 + 5 words" label uses).
--   lb_updated_at  when the counters were last recomputed (every saveUser).
--
-- The counters are recomputed server-side from the saved blob inside the
-- same PATCH that stores it (netlify/functions/saveUser.js), so the board
-- costs no extra round-trip on the save path and nothing at all at boot.

alter table public.users add column if not exists lb_name text;
alter table public.users add column if not exists lb_words integer not null default 0;
alter table public.users add column if not exists lb_anna integer not null default 0;
alter table public.users add column if not exists lb_updated_at timestamptz;

-- One name per learner, case-insensitively, so two people can't both be
-- "Nekh". The join path maps the unique violation to "that name is taken".
create unique index if not exists users_lb_name_unique
  on public.users (lower(lb_name)) where lb_name is not null;

-- The two board reads: top N by each counter among learners who joined.
create index if not exists users_lb_words_idx
  on public.users (lb_words desc) where lb_name is not null;
create index if not exists users_lb_anna_idx
  on public.users (lb_anna desc) where lb_name is not null;

comment on column public.users.lb_name is
  'Leaderboard display name chosen by the learner; NULL = not on the board';
comment on column public.users.lb_words is
  'Leaderboard: concepts completed at level 7 across all runs (recomputed on every save)';
comment on column public.users.lb_anna is
  'Leaderboard: words encountered with Anna (admitted + captured) across all runs';
