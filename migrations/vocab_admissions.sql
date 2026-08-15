-- Append-only ledger of vocabulary admissions to the mastery ladder, for
-- retention analytics ("of tutor-admitted words, what fraction reach L7 in
-- 30/60/90 days vs pack-admitted?"). Run this once in Supabase Dashboard →
-- SQL Editor.
--
-- Writer: the tutor→app vocabulary write-back admission path (via
-- SUPABASE_SERVICE_ROLE_KEY — never the anon key). Reader: the team from the
-- Supabase dashboard, which bypasses RLS. There are deliberately NO anon
-- policies: an anon INSERT would let anyone spoof admission rows and poison
-- the retention queries, and an anon SELECT would leak learner emails.

create table if not exists public.vocab_admissions (
  id            uuid primary key default gen_random_uuid(),
  user_email    text not null,
  lang          text not null,
  cid           text not null,     -- the concept id assigned on admission
  word          text not null,     -- the target-language base form
  translation   text,
  pos           text,
  admitted_at   timestamptz not null default now(),
  admitted_from text not null check (admitted_from in ('pack','tutor')),
  sessions_seen int not null default 3   -- how many tutor sessions before admission
);

create index if not exists vocab_admissions_user_lang_idx
  on public.vocab_admissions (user_email, lang);

alter table public.vocab_admissions enable row level security;
