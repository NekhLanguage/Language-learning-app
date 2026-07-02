// validate-grammar-notes.mjs
// Ensures grammar_notes.json fully covers the engine's rule ids: every rule
// in GRAMMAR_RULE_IDS must have a { title, body } note in every supported
// language, no unknown rule keys, and {lang} placeholders must be written
// exactly (a stray {Lang}/{ lang } would leak into the UI).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GRAMMAR_RULE_IDS } from '../sentence_engine.mjs';
import { loadLanguageCodes } from './load-vocab.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];

let data;
try {
  data = JSON.parse(fs.readFileSync(path.join(ROOT, 'grammar_notes.json'), 'utf8'));
} catch (e) {
  console.error(`grammar_notes.json unreadable: ${e.message}`);
  process.exit(1);
}

const notes = data.notes || {};
const langCodes = loadLanguageCodes();

for (const rule of GRAMMAR_RULE_IDS) {
  if (!notes[rule]) {
    problems.push(`missing rule: ${rule}`);
    continue;
  }
  for (const lc of langCodes) {
    const entry = notes[rule][lc];
    if (!entry) {
      problems.push(`${rule}: missing language ${lc}`);
      continue;
    }
    for (const field of ['title', 'body']) {
      const v = entry[field];
      if (typeof v !== 'string' || !v.trim()) {
        problems.push(`${rule}.${lc}.${field}: empty`);
        continue;
      }
      // Catch malformed placeholders: any {...} that isn't exactly {lang}.
      for (const m of v.matchAll(/\{[^}]*\}/g)) {
        if (m[0] !== '{lang}') problems.push(`${rule}.${lc}.${field}: bad placeholder ${m[0]}`);
      }
    }
  }
}

for (const rule of Object.keys(notes)) {
  if (!GRAMMAR_RULE_IDS.includes(rule)) {
    problems.push(`unknown rule key in grammar_notes.json: ${rule}`);
  }
}

if (problems.length) {
  console.error(`validate-grammar-notes: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(
  `validate-grammar-notes: OK — ${GRAMMAR_RULE_IDS.length} rules × ${langCodes.length} languages`
);
