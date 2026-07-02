// validate-coaching-lines.mjs
// Checks coaching_lines.json: full reason × stage × language coverage for
// milestone lines, 4 session-complete lines per language, correct {detail}
// placement (reason lines exactly once; fun/generic never), only known
// placeholders, plain text. Tolerates the file being absent (the app falls
// back to legacy uiStrings templates).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLanguageCodes } from './load-vocab.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'coaching_lines.json');

if (!fs.existsSync(FILE)) {
  console.log('validate-coaching-lines: coaching_lines.json absent — nothing to check');
  process.exit(0);
}

const REASONS_WITH_DETAIL = ['travel', 'person', 'career', 'heritage', 'culture'];
const REASONS_WITHOUT_DETAIL = ['fun', 'generic'];
const STAGES = ['early', 'mid', 'late'];
const SESSION_LINES = 4;

const problems = [];
let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`coaching_lines.json unreadable: ${e.message}`);
  process.exit(1);
}

// An empty-content stub (no milestones, no session lines) counts as absent:
// the app falls back to legacy templates until content lands.
if (
  Object.keys(data.milestones || {}).length === 0 &&
  Object.keys(data.sessionComplete || {}).length === 0
) {
  console.log('validate-coaching-lines: stub with no content — nothing to check');
  process.exit(0);
}

const langCodes = loadLanguageCodes();

function checkText(where, text) {
  if (typeof text !== 'string' || !text.trim()) {
    problems.push(`${where}: empty`);
    return null;
  }
  if (/[<>]/.test(text)) problems.push(`${where}: HTML characters not allowed`);
  for (const m of text.matchAll(/\{[^}]*\}/g)) {
    if (!['{detail}', '{n}', '{lang}'].includes(m[0])) {
      problems.push(`${where}: unknown placeholder ${m[0]}`);
    }
  }
  return text;
}

const milestones = data.milestones || {};
for (const reason of [...REASONS_WITH_DETAIL, ...REASONS_WITHOUT_DETAIL]) {
  for (const stage of STAGES) {
    for (const lc of langCodes) {
      const where = `milestones.${reason}.${stage}.${lc}`;
      const text = checkText(where, milestones[reason]?.[stage]?.[lc]);
      if (text === null) continue;
      const detailCount = (text.match(/\{detail\}/g) || []).length;
      if (REASONS_WITH_DETAIL.includes(reason) && detailCount !== 1) {
        problems.push(`${where}: needs {detail} exactly once (found ${detailCount})`);
      }
      if (REASONS_WITHOUT_DETAIL.includes(reason) && detailCount !== 0) {
        problems.push(`${where}: must not contain {detail}`);
      }
    }
  }
}

const sessions = data.sessionComplete || {};
for (const lc of langCodes) {
  const pool = sessions[lc];
  if (!Array.isArray(pool) || pool.length !== SESSION_LINES) {
    problems.push(`sessionComplete.${lc}: expected ${SESSION_LINES} lines, got ${Array.isArray(pool) ? pool.length : typeof pool}`);
    continue;
  }
  pool.forEach((line, i) => checkText(`sessionComplete.${lc}[${i}]`, line));
}

if (problems.length) {
  console.error(`validate-coaching-lines: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(
  `validate-coaching-lines: OK — ${REASONS_WITH_DETAIL.length + REASONS_WITHOUT_DETAIL.length} reasons × ${STAGES.length} stages × ${langCodes.length} languages + ${SESSION_LINES} session lines each`
);
