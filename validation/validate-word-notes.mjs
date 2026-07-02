// validate-word-notes.mjs
// Sanity-checks word_notes.json (optional per-word mnemonic hooks):
// every concept id must exist in the merged vocab, language codes must be
// real, and note text must be short plain text (no HTML — the UI renders
// via innerHTML). Notes are optional, so coverage is NOT required.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadVocab, loadLanguageCodes } from './load-vocab.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'word_notes.json');

if (!fs.existsSync(FILE)) {
  console.log('validate-word-notes: word_notes.json absent — nothing to check');
  process.exit(0);
}

const problems = [];
let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`word_notes.json unreadable: ${e.message}`);
  process.exit(1);
}

const langCodes = new Set(loadLanguageCodes());
const vocab = loadVocab([...langCodes]);
const notes = data.notes || {};
let count = 0;

for (const [cid, targets] of Object.entries(notes)) {
  if (!vocab.concepts[cid]) problems.push(`unknown concept: ${cid}`);
  for (const [target, supports] of Object.entries(targets)) {
    if (!langCodes.has(target)) problems.push(`${cid}: unknown target lang ${target}`);
    for (const [support, text] of Object.entries(supports)) {
      count++;
      if (!langCodes.has(support)) problems.push(`${cid}.${target}: unknown support lang ${support}`);
      if (typeof text !== 'string' || !text.trim()) {
        problems.push(`${cid}.${target}.${support}: empty note`);
      } else {
        if (text.length > 200) problems.push(`${cid}.${target}.${support}: too long (${text.length})`);
        if (/[<>]/.test(text)) problems.push(`${cid}.${target}.${support}: HTML characters not allowed`);
      }
    }
  }
}

if (problems.length) {
  console.error(`validate-word-notes: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`validate-word-notes: OK — ${count} notes across ${Object.keys(notes).length} concepts`);
