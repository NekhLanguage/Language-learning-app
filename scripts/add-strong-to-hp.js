#!/usr/bin/env node
// One-off: STRONG is referenced by a harry_potter sentence template but only
// defined in the pokemon pack, so it rendered as the literal "STRONG". Copy the
// concept + per-language forms from pokemon into harry_potter. Anchored on the
// existing MAGICAL adjective (present once in concepts and once per forms block)
// to keep the pack's bespoke formatting and a minimal diff.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const hpPath = path.join(ROOT, 'harry_potter.json');

const hp = JSON.parse(fs.readFileSync(hpPath, 'utf8'));
const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'pokemon.json'), 'utf8'));

const langOrder = Object.keys(hp.languages); // insertion order == file order
const strongByLang = {};
for (const l of langOrder) strongByLang[l] = pk.languages[l].forms.STRONG;

const lines = fs.readFileSync(hpPath, 'utf8').split('\n');
const out = [];
let formIdx = 0, insertedConcept = false, insertedForms = 0;

for (const line of lines) {
  out.push(line);
  if (!insertedConcept && /^\s*\{\s*"concept_id":\s*"MAGICAL"/.test(line)) {
    const indent = line.match(/^(\s*)/)[1];
    out.push(indent + '{ "concept_id": "STRONG", "type": "adjective" },');
    insertedConcept = true;
    continue;
  }
  const m = line.match(/^(\s*)"MAGICAL":/);
  if (m) {
    const lang = langOrder[formIdx++];
    out.push(m[1] + '"STRONG": ' + JSON.stringify(strongByLang[lang]) + ',');
    insertedForms++;
  }
}

const text = out.join('\n');
JSON.parse(text); // validate
fs.writeFileSync(hpPath, text);

const after = JSON.parse(text);
console.log('concept inserted:', insertedConcept, '| forms inserted:', insertedForms, 'of', langOrder.length);
console.log('HP STRONG concept present:', after.concepts.some(c => c.concept_id === 'STRONG'));
const missing = langOrder.filter(l => !after.languages[l].forms.STRONG);
console.log('langs missing STRONG form:', missing.length ? missing.join(',') : 'none');
