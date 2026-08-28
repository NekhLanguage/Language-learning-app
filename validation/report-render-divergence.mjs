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

import { loadLanguageCodes } from './load-vocab.mjs';
import { computeRenderDivergence } from './lib/render-divergence-core.mjs';

const langArg = process.argv.indexOf('--lang');
const onlyLang = langArg !== -1 ? process.argv[langArg + 1] : null;

const langCodes = loadLanguageCodes();
// Shared computation (lib/render-divergence-core.mjs) — same engine config
// and normalization as the ratchet and the language gate.
const { perLang } = computeRenderDivergence({ langCodes });
const byLang = {};
for (const lc of langCodes) {
  byLang[lc] = { total: perLang[lc]?.total || 0, diverged: perLang[lc]?.entries || [] };
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
