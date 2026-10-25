#!/usr/bin/env node
// Migrations-applied check (Gazi suggestion, Dan-approved 2026-10-25):
// a merged migration nobody ran leaves a feature on a missing table.
// leaderboard_weekly.sql sat unapplied for 17 days that way, and
// referral_anna_reward.sql was unapplied on the day pricing went live.
//
// This reads every migrations/*.sql, lists the schema objects it creates
// (tables, added columns, indexes, views, functions, triggers) and prints
// ONE read-only SQL query. Run that query against production (Dan has
// Supabase read). It returns one row per expected object that is NOT
// there, with the migration that should have created it. No rows means
// everything merged has been applied. The script itself never connects
// to the database.
//
//   node scripts/check-migrations.mjs                    the query
//   node scripts/check-migrations.mjs --json             the expectations
//   node scripts/check-migrations.mjs --dir ../site/migrations   other repo
//
// Its result goes into every post-merge checklist (Dan 2026-10-25).

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Drop comments and dollar-quoted bodies (function code is not schema).
function stripSql(sql) {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$$$")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const ident = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;

// The objects one migration file creates.
export function expectationsFor(file, sql) {
  const out = [];
  const add = (kind, schemaObject, column = null) => out.push({ file, kind, object: schemaObject, column });
  for (const raw of stripSql(sql).split(";")) {
    const stmt = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (!stmt) continue;
    let m;
    if ((m = new RegExp(`^create table (?:if not exists )?${ident}`).exec(stmt))) add("table", m[1]);
    if ((m = new RegExp(`^alter table (?:only )?(?:if exists )?${ident}`).exec(stmt))) {
      const table = m[1];
      for (const c of stmt.matchAll(new RegExp(`add column (?:if not exists )?${ident}`, "g"))) add("column", table, c[1]);
    }
    if ((m = new RegExp(`^create (?:unique )?index (?:concurrently )?(?:if not exists )?${ident}`).exec(stmt))) add("index", m[1]);
    if ((m = new RegExp(`^create (?:or replace )?(?:materialized )?view (?:if not exists )?${ident}`).exec(stmt))) add("view", m[1]);
    if ((m = new RegExp(`^create (?:or replace )?function ${ident}`).exec(stmt))) add("function", m[1]);
    if ((m = new RegExp(`^create (?:or replace )?(?:constraint )?trigger ${ident}`).exec(stmt))) add("trigger", m[1]);
  }
  return out;
}

export function collect(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => expectationsFor(f, readFileSync(path.join(dir, f), "utf8")));
}

const lit = (s) => (s === null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

// One read-only query: expected objects LEFT JOINed to the catalogue,
// keeping only the missing ones.
export function checkQuery(expectations) {
  if (!expectations.length) return "select 'no migrations found' as note;";
  const rows = expectations.map((e) => `(${lit(e.file)}, ${lit(e.kind)}, ${lit(e.object)}, ${lit(e.column)})`).join(",\n  ");
  return `-- Migrations-applied check (scripts/check-migrations.mjs). Read-only.
-- Every row returned is an object a merged migration creates that is
-- missing on this database. No rows = all applied.
with expected(file, kind, object, col) as (values
  ${rows}
)
select e.file, e.kind, e.object, e.col
from expected e
where not case e.kind
  when 'table' then exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = e.object)
  when 'view' then exists (select 1 from information_schema.views v where v.table_schema = 'public' and v.table_name = e.object)
  when 'column' then exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = e.object and c.column_name = e.col)
  when 'index' then exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = e.object)
  when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = e.object)
  when 'trigger' then exists (select 1 from pg_trigger g where g.tgname = e.object and not g.tgisinternal)
  else true end
order by e.file, e.kind, e.object, e.col;`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : path.join(ROOT, "migrations");
  const expectations = collect(dir);
  if (args.includes("--json")) console.log(JSON.stringify(expectations, null, 2));
  else console.log(checkQuery(expectations));
}
