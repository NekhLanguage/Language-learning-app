// load-vocab.mjs
// Shared loader that reconstructs the same GLOBAL_VOCAB + template set the
// browser app builds at runtime (see loadAndMergeVocab / loadTemplates in
// app.js), but for offline Node tools. Used by validate-sentences.mjs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Mirror of VOCAB_FILES in app.js (core lexicon + resource packs).
export const VOCAB_FILES = [
  'adjectives.json', 'connectors.json', 'directions_positions.json',
  'glue_words.json', 'nouns.json', 'numbers.json',
  'politeness_modality.json', 'pronouns.json', 'quantifiers.json',
  'question_words.json', 'time_words.json', 'verbs.json',
  'pokemon.json', 'harry_potter.json', 'cooking.json', 'anime.json',
  'football.json', 'music.json', 'everyday_life.json', 'fashion_style.json',
  'gaming.json', 'tourism.json', 'space_scifi.json', 'fitness.json',
];

// 13 supported languages, derived from languages.js (same source the other
// validators read), falling back to the lang/ directory.
export function loadLanguageCodes() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'languages.js'), 'utf8');
    const codes = [];
    const re = /\{\s*code:\s*"([a-z]{2})"/g;
    let m;
    while ((m = re.exec(raw)) !== null) codes.push(m[1]);
    if (codes.length) return codes;
  } catch { /* fall through */ }
  return fs.readdirSync(path.join(ROOT, 'lang'))
    .filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// Build the merged vocab exactly as the app does: concepts tagged with their
// source file, language forms merged from pack `languages` sections and from
// each lang/<code>.json `forms`.
export function loadVocab(langCodes = loadLanguageCodes()) {
  const vocab = { concepts: {}, languages: {} };
  for (const file of VOCAB_FILES) {
    const data = readJson(file);
    for (const concept of data.concepts || []) {
      vocab.concepts[concept.concept_id] = { ...concept, source: file };
    }
    for (const [lc, ld] of Object.entries(data.languages || {})) {
      vocab.languages[lc] ??= { forms: {} };
      Object.assign(vocab.languages[lc].forms, ld.forms || {});
    }
  }
  for (const lc of langCodes) {
    let data;
    try { data = readJson(`lang/${lc}.json`); } catch { continue; }
    vocab.languages[lc] ??= { forms: {} };
    Object.assign(vocab.languages[lc].forms, data.forms || {});
  }
  return vocab;
}

// All templates across the core file + every resource pack, each tagged with
// the file it came from (for reporting).
export function loadTemplates() {
  const files = fs.readdirSync(ROOT)
    .filter(f => /^sentence_templates.*\.json$/.test(f)).sort();
  const out = [];
  for (const file of files) {
    const data = readJson(file);
    for (const t of data.templates || []) out.push({ ...t, _file: file });
  }
  return out;
}
