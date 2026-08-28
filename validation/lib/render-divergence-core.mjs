// render-divergence-core.mjs
// The single implementation of "how far does the engine diverge from the
// authored native renders?", shared by three consumers:
//   - validation/validate-render-divergence.mjs  (per-sentence ratchet)
//   - validation/validate-language-gate.mjs      (per-language quality gate)
//   - validation/report-render-divergence.mjs    (manual drill-down tool)
// Extracted so the deterministic engine config and the normalization rule
// can never drift between them — two copies of this loop is how a gate and
// its ratchet would silently start measuring different things.

import { loadVocab, loadTemplates, loadLanguageCodes } from '../load-vocab.mjs';
import { configureEngine, buildSentence } from '../../sentence_engine.mjs';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Runs the real sentence engine over every template × language that has a
// human-authored render string. Returns:
//   found   Map key `${tpl._file}|${tpl.template_id}|${lc}` ->
//           { authored, generated }   (divergences only)
//   perLang { [lc]: { total, diverged, entries: [{id, file, authored,
//           generated}] } }
// Deterministic config mirrors validate-sentences.mjs: everything released,
// rng high enough to suppress random modifier injection.
export function computeRenderDivergence({
  langCodes = loadLanguageCodes(),
  vocab = null,
  templates = null,
} = {}) {
  vocab ??= loadVocab(langCodes);
  templates ??= loadTemplates();

  configureEngine({
    vocab: () => vocab,
    getReleased: () => Object.keys(vocab.concepts),
    ensureProgress: () => ({ level: 99, completed: false }),
    rng: () => 0.999,
  });

  const found = new Map();
  const perLang = {};
  for (const tpl of templates) {
    for (const lc of langCodes) {
      const authored = tpl.render?.[lc];
      if (typeof authored !== 'string' || !authored.trim()) continue;
      perLang[lc] ??= { total: 0, diverged: 0, entries: [] };
      perLang[lc].total++;
      let generated;
      try { generated = buildSentence(lc, tpl); } catch (e) { generated = `<threw: ${e.message}>`; }
      if (norm(generated) !== norm(authored)) {
        perLang[lc].diverged++;
        perLang[lc].entries.push({
          id: tpl.template_id, file: tpl._file, authored, generated,
        });
        found.set(`${tpl._file}|${tpl.template_id}|${lc}`, { authored, generated });
      }
    }
  }
  return { found, perLang };
}

export { norm as normalizeRender };
