// Migrations-applied check (Dan-approved 2026-10-25): the parser must find
// every schema object a migration creates, or the production query can't
// report it missing.

import test from "node:test";
import assert from "node:assert/strict";
import { expectationsFor, collect, checkQuery } from "../../scripts/check-migrations.mjs";

test("parses columns, tables, indexes, views, functions and triggers; ignores comments and function bodies", () => {
  const sql = `-- alter table public.users add column if not exists commented_out text;
alter table public.users
  add column if not exists a timestamptz,
  add column if not exists b int not null default 0;
create table if not exists public.things (id bigserial primary key);
create unique index if not exists things_idx on public.things (id);
create or replace view public.things_view with (security_invoker = true) as select 1;
create or replace function public.do_it() returns trigger language plpgsql as $$
begin
  alter table public.users add column if not exists inside_body text;
  return new;
end;
$$;
create trigger do_it_trg before update on public.users for each row execute function public.do_it();
alter table public.things enable row level security;`;
  const got = expectationsFor("x.sql", sql).map((e) => `${e.kind}:${e.object}${e.column ? "." + e.column : ""}`);
  assert.deepEqual(got, [
    "column:users.a", "column:users.b", "table:things", "index:things_idx",
    "view:things_view", "function:do_it", "trigger:do_it_trg",
  ]);
});

test("the real migrations directory yields the objects the leaderboard and pricing ships depend on", () => {
  const all = collect(new URL("../../migrations", import.meta.url).pathname);
  const has = (kind, object, column = null) => all.some((e) => e.kind === kind && e.object === object && e.column === column);
  assert.ok(has("column", "users", "lb_xp"));
  assert.ok(has("column", "users", "lb_excluded"));
  assert.ok(has("trigger", "users_lb_weekly"));
  assert.ok(has("column", "referrals", "anna_reward_granted_at"));
  assert.ok(has("column", "users", "anna_trial_ends_at"));
  const q = checkQuery(all);
  assert.match(q, /^-- Migrations-applied check/);
  assert.ok(!/\b(insert|update|delete|drop|alter|create)\b/i.test(q.replace(/^--.*$/gm, "")), "the query is read-only");
});
