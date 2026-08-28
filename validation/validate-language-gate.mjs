#!/usr/bin/env node
// validate-language-gate.mjs
// The per-language QUALITY GATE (Nekh-approved 2026-08-28): a language that
// learners can see must generate sentences that match the human-authored
// native renders at least (1 - THRESHOLD) of the time. The per-sentence
// ratchet (validate-render-divergence) stops individual regressions; this
// gate is the launch-readiness contract the ratchet cannot express — it is
// what would have stopped «나 음식 먹다» from ever reaching a learner.
//
// Rules (decision logic in lib/language-gate-core.mjs, unit-tested):
//   - THRESHOLD is the maximum allowed divergence rate (0.15 = 85% match).
//     Nekh's plan: start at 85%, raise toward 90% as the queue clears —
//     that change is this one constant.
//   - A language row with `hidden: true` in languages.js is registered for
//     every validator but invisible to learners: reported here, never
//     failing. This is the "being built" state new languages live in until
//     they pass.
//   - Pre-existing languages over the threshold are grandfathered in
//     validation/language-gate-exceptions.json, FROZEN at their 2026-08-28
//     rate — a language exceeding its own exception fails the build, so
//     nothing can quietly get worse. The exceptions list, worst-first, IS
//     the standing fix queue.
//   - A visible language with no authored render corpus at all fails: no
//     ground truth means no evidence of quality.
//
// Run:  node validation/validate-language-gate.mjs [--update-exceptions]
//   --update-exceptions tightens: prunes languages now under THRESHOLD and
//   lowers any exception whose current rate improved. It never raises one.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { computeRenderDivergence } from './lib/render-divergence-core.mjs';
import { evaluateLanguageGate, tightenExceptions } from './lib/language-gate-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_FILE = path.join(HERE, 'language-gate-exceptions.json');
const UPDATE = process.argv.includes('--update-exceptions');

// Maximum divergence from the authored native renders a VISIBLE language
// may ship with. 0.15 = 85% match (start); the plan is to walk this down
// to 0.10 (90%) as the exceptions queue clears.
const THRESHOLD = 0.15;

// The registry is imported as a real module (not the regex scrape the
// loaders use) because the gate needs the `hidden` flag, which the scrape
// deliberately ignores.
const { AVAILABLE_LANGUAGES } =
  await import(pathToFileURL(path.join(HERE, '..', 'languages.js')).href);

const { perLang } = computeRenderDivergence();

let exceptions = {};
try { exceptions = JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf8')); } catch { /* none yet */ }

const rows = AVAILABLE_LANGUAGES.map(({ code, hidden }) => {
  const d = perLang[code] || { total: 0, diverged: 0 };
  return { code, hidden: !!hidden, total: d.total, diverged: d.diverged };
});

if (UPDATE) {
  const next = tightenExceptions({ rows, exceptions, threshold: THRESHOLD });
  fs.writeFileSync(EXCEPTIONS_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`Exceptions updated: ${Object.keys(next).length} language(s) still grandfathered -> ${path.relative(process.cwd(), EXCEPTIONS_FILE)}`);
  process.exit(0);
}

const { failures, queue, graduated, statuses } =
  evaluateLanguageGate({ rows, exceptions, threshold: THRESHOLD });

console.log(`Language quality gate — max divergence ${(THRESHOLD * 100).toFixed(0)}% (match ≥ ${((1 - THRESHOLD) * 100).toFixed(0)}%)`);
console.log('lang   rate  status');
for (const s of statuses) {
  const rateStr = s.rate === null ? '   — ' : `${(s.rate * 100).toFixed(1).padStart(5)}%`;
  console.log(`${s.code.padEnd(5)} ${rateStr}  ${s.status}`);
}

if (queue.length) {
  console.log('\nFix queue (worst first — these block raising the bar):');
  for (const r of queue) {
    console.log(`  ${r.code}  ${(r.rate * 100).toFixed(1)}%  (${r.diverged} of ${r.total} sentences diverge)`);
  }
}

// Stale exceptions are advisory, not fatal — pruning is deliberate.
if (graduated.length) {
  console.log(`\nGraduated below the threshold — prune with: npm run validate:gate:update  (${graduated.join(', ')})`);
}

if (failures.length) {
  console.error('\nLANGUAGE GATE FAILED:');
  for (const f of failures) console.error('  ' + f);
  console.error('\nA visible language must match the authored native corpus at ' +
    `${((1 - THRESHOLD) * 100).toFixed(0)}%+, stay within its frozen exception, ` +
    'or be hidden while it is being built.');
  process.exit(1);
}
console.log('\nLanguage gate PASS.');
