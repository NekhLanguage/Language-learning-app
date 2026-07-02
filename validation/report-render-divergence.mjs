// report-render-divergence.mjs (manual tool — not part of `npm run validate`)
//
// Quantifies where the engine's generated sentences diverge from the
// human-authored render strings, per language. Divergences are exactly the
// places a support-language sentence would have read as a stilted
// word-for-word translation before the authored-render preference landed —
// and they remain the priority list for engine grammar work, since the
// TARGET language always uses engine output.
//
// Usage:
//   node validation/report-render-divergence.mjs            # summary
//   node validation/report-render-divergence.mjs --lang fr  # every fr diff

import { loadVocab, loadLanguageCodes, loadTemplates } from './load-vocab.mjs';
import { configureEngine, buildSentence } from '../sentence_engine.mjs';

const langArg = process.argv.indexOf('--lang');
const onlyLang = langArg !== -1 ? process.argv[langArg + 1] : null;

const langCodes = loadLanguageCodes();
const vocab = loadVocab(langCodes);
const templates = loadTemplates();

configureEngine({
  vocab: () => vocab,
  getReleased: () => Object.keys(vocab.concepts),
  ensureProgress: () => ({ level: 99, completed: false }),
  rng: () => 0.999, // plain sentences — no random modifiers
});

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const byLang = {};
for (const lc of langCodes) byLang[lc] = { total: 0, diverged: [] };

for (const tpl of templates) {
  for (const lc of langCodes) {
    const authored = tpl.render?.[lc];
    if (typeof authored !== 'string' || !authored.trim()) continue;
    byLang[lc].total++;
    let generated;
    try {
      generated = buildSentence(lc, tpl);
    } catch (e) {
      generated = `<threw: ${e.message}>`;
    }
    if (norm(generated) !== norm(authored)) {
      byLang[lc].diverged.push({ id: tpl.template_id, file: tpl._file, authored, generated });
    }
  }
}

console.log('Engine output vs authored render (plain sentences, no modifiers)\n');
console.log('lang  authored  diverged  rate');
for (const lc of langCodes) {
  const { total, diverged } = byLang[lc];
  if (!total) continue;
  const rate = ((diverged.length / total) * 100).toFixed(1).padStart(5);
  console.log(`${lc.padEnd(5)} ${String(total).padStart(8)} ${String(diverged.length).padStart(9)} ${rate}%`);
}

if (onlyLang) {
  const entries = byLang[onlyLang]?.diverged || [];
  console.log(`\n— all ${entries.length} divergences for ${onlyLang} —`);
  for (const d of entries) {
    console.log(`\n${d.id} (${d.file})`);
    console.log(`  authored : ${d.authored}`);
    console.log(`  generated: ${d.generated}`);
  }
} else {
  console.log('\nRun with --lang <code> to list every divergence for one language.');
}
