#!/usr/bin/env node
// fill-pack-translations.js
// Injects missing `languages.<code>` blocks into resource-pack JSON files
// WITHOUT touching existing blocks (preserves their bespoke formatting by
// splicing raw text). Authored translation data lives in scripts/_pack_data/
// as one file per pack+language: "<pack>.<lang>.json" whose top-level shape is
//   { "label": "French", "forms": { "CONCEPT": <entry>, ... } }
// Every concept_id in the pack must be present in `forms`, or the script aborts
// for that block (no partial injection).
//
// Run from repo root: node scripts/fill-pack-translations.js [--check]
//   --check : validate data files cover all concepts, but write nothing.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const DATA_DIR  = path.join(__dirname, '_pack_data');
const CHECK_ONLY = process.argv.includes('--check');

// Find the matching closing-brace index for the object that opens at openIdx
// (raw[openIdx] must be '{'). Brace-aware but string-aware enough for our JSON.
function matchBrace(raw, openIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('Unbalanced braces');
}

// Serialize one language block at the pack indentation (lang key = 4 spaces,
// label/forms = 6, entries = 8). Entries are compact one-per-line objects.
function serializeBlock(lang, label, forms, conceptIds) {
  const lines = [];
  lines.push(`    "${lang}": {`);
  lines.push(`      "label": ${JSON.stringify(label)},`);
  lines.push(`      "forms": {`);
  conceptIds.forEach((cid, i) => {
    const comma = i === conceptIds.length - 1 ? '' : ',';
    lines.push(`        ${JSON.stringify(cid)}: ${JSON.stringify(forms[cid])}${comma}`);
  });
  lines.push(`      }`);
  lines.push(`    }`);
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`No data dir: ${DATA_DIR}`);
    process.exit(1);
  }
  const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  // Group by pack
  const byPack = {};
  for (const df of dataFiles) {
    const m = df.match(/^(.*)\.([a-z]{2})\.json$/);
    if (!m) { console.warn(`skip (bad name): ${df}`); continue; }
    const [, pack, lang] = m;
    (byPack[pack] = byPack[pack] || []).push({ lang, file: df });
  }

  let totalBlocks = 0, totalEntries = 0, problems = 0;

  for (const pack of Object.keys(byPack).sort()) {
    const packPath = path.join(ROOT, `${pack}.json`);
    if (!fs.existsSync(packPath)) { console.warn(`skip: no pack ${pack}.json`); continue; }
    let raw = fs.readFileSync(packPath, 'utf8');
    const data = JSON.parse(raw);
    const conceptIds = data.concepts.map(c => c.concept_id).filter(Boolean);

    const newBlocks = [];
    for (const { lang, file } of byPack[pack].sort((a, b) => a.lang.localeCompare(b.lang))) {
      if (data.languages[lang]) {
        console.warn(`  ${pack}: "${lang}" already present — skipping`);
        continue;
      }
      const blob = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      const forms = blob.forms || blob; // tolerate either shape
      const label = blob.label || lang.toUpperCase();
      const missing = conceptIds.filter(c => !(c in forms));
      const empty = conceptIds.filter(c => c in forms &&
        !(typeof forms[c] === 'string' ? forms[c].trim()
          : Array.isArray(forms[c]) ? (forms[c][0] || '').trim()
          : ((forms[c] && (forms[c].form || forms[c].base)) || '').trim()));
      if (missing.length || empty.length) {
        problems++;
        console.error(`  ✗ ${pack}.${lang}: missing ${missing.length} [${missing.slice(0,5).join(', ')}${missing.length>5?'…':''}], empty ${empty.length} [${empty.slice(0,5).join(', ')}]`);
        continue;
      }
      newBlocks.push({ lang, label, forms });
      totalEntries += conceptIds.length;
    }

    if (CHECK_ONLY || newBlocks.length === 0) {
      if (newBlocks.length) console.log(`  ✓ ${pack}: ${newBlocks.map(b=>b.lang).join(', ')} ready (${conceptIds.length} concepts each)`);
      continue;
    }

    // Splice: find languages object, insert before its closing brace.
    const langKeyIdx = raw.lastIndexOf('"languages"');
    const openIdx = raw.indexOf('{', langKeyIdx);
    const closeIdx = matchBrace(raw, openIdx);

    // Find the last non-whitespace char before closeIdx (end of last block).
    let insertAt = closeIdx;
    let j = closeIdx - 1;
    while (j > openIdx && /\s/.test(raw[j])) j--;
    insertAt = j + 1; // right after last block's closing brace

    const blockText = newBlocks
      .map(b => serializeBlock(b.lang, b.label, b.forms, conceptIds))
      .join(',\n');

    raw = raw.slice(0, insertAt) + ',\n' + blockText + '\n  ' + raw.slice(closeIdx);

    // Sanity: must still parse, and must contain the new langs.
    const reparsed = JSON.parse(raw);
    for (const b of newBlocks) {
      if (!reparsed.languages[b.lang]) throw new Error(`${pack}: ${b.lang} not present after splice`);
    }
    fs.writeFileSync(packPath, raw);
    totalBlocks += newBlocks.length;
    console.log(`  ✓ ${pack}: injected ${newBlocks.map(b=>b.lang).join(', ')}`);
  }

  console.log(`\n${CHECK_ONLY ? '[check] ' : ''}Done. ${totalBlocks} blocks injected, ${totalEntries} entries, ${problems} problem(s).`);
  if (problems) process.exit(1);
}

main();
