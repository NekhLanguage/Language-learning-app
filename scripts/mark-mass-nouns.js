#!/usr/bin/env node
// Mark unambiguous mass/uncountable nouns with countable:false so nounPhrase
// stops adding a wrong indefinite article in gender-triggered languages
// (de/pt/el/es/fr) — e.g. "lernt eine Magie" -> "lernt Magie". Only nouns that
// are clearly mass across the article languages are included; borderline cases
// (soup, sauce, fruit, ...) are intentionally left countable.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// concept -> defining file
const MASS = {
  MAGIC: 'harry_potter.json', HOMEWORK: 'harry_potter.json',
  WATER: 'nouns.json', FOOD: 'nouns.json',
  MEAT: 'cooking.json', BUTTER: 'cooking.json', SALT: 'cooking.json', DOUGH: 'cooking.json',
  HEALTH: 'pokemon.json',
  FURNITURE: 'everyday_life.json', GARBAGE: 'everyday_life.json', LAUNDRY: 'everyday_life.json',
  LUGGAGE: 'tourism.json',
  LEATHER: 'fashion_style.json', SILK: 'fashion_style.json', MAKEUP: 'fashion_style.json',
  JAZZ: 'music.json',
  VITALITY: 'gaming.json',
};

// group by file
const byFile = {};
for (const [cid, f] of Object.entries(MASS)) (byFile[f] = byFile[f] || []).push(cid);

let marked = 0;
for (const [file, cids] of Object.entries(byFile)) {
  const full = path.join(ROOT, file);
  let text = fs.readFileSync(full, 'utf8');
  // Strategy: if the file round-trips through JSON.stringify (core vocab),
  // parse + mutate + write. Otherwise do targeted inline text insertion.
  const roundTrips = (() => {
    const r = text.endsWith('\n') ? text.slice(0, -1) : text;
    try { return r === JSON.stringify(JSON.parse(text), null, 2); } catch { return false; }
  })();

  if (roundTrips) {
    const data = JSON.parse(text);
    for (const c of data.concepts) {
      if (cids.includes(c.concept_id) && c.countable !== false) { c.countable = false; marked++; }
    }
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
  } else {
    for (const cid of cids) {
      const re = new RegExp(`(\\{\\s*"concept_id":\\s*"${cid}",\\s*"type":\\s*"noun")(\\s*\\})`);
      const before = text;
      text = text.replace(re, '$1, "countable": false$2');
      if (text !== before) marked++;
      else console.warn(`[warn] ${file}: could not find inline concept ${cid}`);
    }
    JSON.parse(text); // validate
    fs.writeFileSync(full, text);
  }
  console.log(`${file}: marked ${cids.join(', ')}`);
}
console.log(`\nmarked ${marked} mass nouns countable:false`);
