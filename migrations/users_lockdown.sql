-- Lock public.users to the secret key. RUN ONLY AFTER the free-tier PR has
-- deployed to production: before that, production functions still read and
-- write users with the publishable key and would break.
--
-- Why: the old policies ("allow select/insert/update" USING true, role
-- public) plus the publishable key the browser ships meant anyone could,
-- from devtools, read every learner's email and progress, insert their own
-- row (= full app access without paying), or set their own access_until
-- to 'infinity' (= Anna for free). After this, only the Netlify functions
-- (SUPABASE_SECRET_KEY, which bypasses RLS) and the website's
-- stripe-webhook (same key) touch the table.
--
-- Verify after running (both must hold):
--   select policyname from pg_policies where tablename = 'users';  -- no rows
--   select privilege_type from information_schema.role_table_grants
--     where table_name = 'users' and grantee in ('anon','authenticated'); -- no rows

alter table public.users enable row level security;

drop policy if exists "allow select" on public.users;
drop policy if exists "allow insert" on public.users;
drop policy if exists "allow update" on public.users;

revoke all on public.users from anon, authenticated;
