#!/usr/bin/env node
// convert-tr-aorist-to-iyor.js
// One-off: standardize Turkish pack verbs onto the present-continuous (-iyor)
// tense so the packs don't mix -iyor and aorist (geniş zaman). For each verb we
// author only the verified 3rd-person-singular -iyor form; the remaining persons
// are derived by appending the fixed post-"-yor" personal endings, which are
// invariant across verbs (…yorum / …yorsun / …yor / …yoruz / …yorsunuz / …yorlar).
//
// Replaces the existing (aorist) tr entry in every pack, scoped to concept_id +
// the Turkish base, so only the intended entries change. Run after the verb
// conjugation pass. Usage: node scripts/convert-tr-aorist-to-iyor.js [--check]

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

// concept -> [ turkish infinitive base, verified 3sg -iyor form ]
const VERBS = {
  COOK:    ['pişirmek',        'pişiriyor'],
  CUT:     ['kesmek',          'kesiyor'],
  BOIL:    ['kaynatmak',       'kaynatıyor'],
  PEEL:    ['soymak',          'soyuyor'],
  FRY:     ['kızartmak',       'kızartıyor'],
  STIR:    ['karıştırmak',     'karıştırıyor'],
  MIX:     ['karıştırmak',     'karıştırıyor'],
  WASH:    ['yıkamak',         'yıkıyor'],
  HEAT:    ['ısıtmak',         'ısıtıyor'],
  CAST:    ['yapmak',          'yapıyor'],
  PROTECT: ['korumak',         'koruyor'],
  CHARM:   ['büyülemek',       'büyülüyor'],
  CURSE:   ['lanetlemek',      'lanetliyor'],
  LEARN:   ['öğrenmek',        'öğreniyor'],
  WRITE:   ['yazmak',          'yazıyor'],
  STUDY:   ['çalışmak',        'çalışıyor'],
  VANISH:  ['kaybolmak',       'kayboluyor'],
  TRANSFORM:['dönüştürmek',    'dönüştürüyor'],
  FLY:     ['uçmak',           'uçuyor'],
  SHOUT:   ['bağırmak',        'bağırıyor'],
  AMPLIFY: ['yükseltmek',      'yükseltiyor'],   // fixes pre-existing truncated "yükselt"
  BURN:    ['yakmak',          'yakıyor'],
  POISON:  ['zehirlemek',      'zehirliyor'],
  PARALYZE:['felç etmek',      'felç ediyor'],
  ATTACK:  ['saldırmak',       'saldırıyor'],
  RUN:     ['kaçmak',          'kaçıyor'],
  CATCH:   ['yakalamak',       'yakalıyor'],
  DEFEAT:  ['yenmek',          'yeniyor'],
  SWITCH:  ['değiştirmek',     'değiştiriyor'],
  USE:     ['kullanmak',       'kullanıyor'],
  PLAY:    ['oynamak',         'oynuyor'],
  HEAL:    ['iyileştirmek',    'iyileştiriyor'],
  RESTORE: ['geri yüklemek',   'geri yüklüyor'],
  GAIN_EXPERIENCE:['deneyim kazanmak', 'deneyim kazanıyor'],
  EVOLVE:  ['evrimleşmek',     'evrimleşiyor'],
};

// Fixed personal endings appended to the "-yor" stem (3sg form).
function paradigm(base, three) {
  return {
    base,
    '1_singular': three + 'um',
    '2_singular': three + 'sun',
    '3_singular': three,
    '1_plural':   three + 'uz',
    '2_plural':   three + 'sunuz',
    '3_plural':   three + 'lar',
  };
}

function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function literal(entry) {
  const keys = ['base','1_singular','2_singular','3_singular','1_plural','2_plural','3_plural'];
  return '{ ' + keys.map(k => `"${k}": ${JSON.stringify(entry[k])}`).join(', ') + ' }';
}

function discoverPacks() {
  return fs.readdirSync(ROOT).filter(f => f.endsWith('.json')).filter(f => {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return false; }
    return d && Array.isArray(d.concepts) && d.languages;
  }).sort();
}

let total = 0;
for (const pf of discoverPacks()) {
  const full = path.join(ROOT, pf);
  let text = fs.readFileSync(full, 'utf8');
  let changed = false;
  for (const [cid, [base, three]] of Object.entries(VERBS)) {
    const lit = literal(paradigm(base, three));
    // Match this concept's tr entry (object containing this Turkish base).
    const re = new RegExp(`("${reEscape(cid)}"\\s*:\\s*)\\{[^}]*"base"\\s*:\\s*"${reEscape(base)}"[^}]*\\}`, 'g');
    text = text.replace(re, (_m, head) => { changed = true; total++; return head + lit; });
  }
  if (changed) {
    JSON.parse(text); // validate
    if (!CHECK) fs.writeFileSync(full, text);
    console.log(`${CHECK ? '[check] ' : ''}${pf}: updated`);
  }
}
console.log(`\n${CHECK ? '[check] would apply' : 'applied'} ${total} Turkish -iyor conversions.`);
