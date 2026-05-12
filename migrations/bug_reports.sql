-- Bug reports submitted from the in-app "Report a bug" button.
-- Run this once in Supabase Dashboard → SQL Editor.
--
-- Reports are written by the /.netlify/functions/submitBug function using
-- the anon key (matching the pattern of the other functions in this repo),
-- so the table needs an RLS policy that allows anon INSERT but blocks
-- anon SELECT. The team reads reports from the Supabase dashboard with
-- the service_role / authenticated viewer, which bypasses RLS.

create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  email        text,
  message      text not null,
  language     text,
  support      text,
  version      text,
  user_agent   text,
  url          text
);

create index if not exists bug_reports_created_at_idx
  on public.bug_reports (created_at desc);

-- Row-level security: anon can INSERT, nothing else.
alter table public.bug_reports enable row level security;

drop policy if exists "anon can insert bug reports" on public.bug_reports;
create policy "anon can insert bug reports"
  on public.bug_reports
  for insert
  to anon
  with check (true);

-- (No SELECT/UPDATE/DELETE policy → those operations are denied for anon.)
