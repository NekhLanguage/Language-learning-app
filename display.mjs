// display.mjs
// Presentation policy for support-language sentences.
//
// The engine generates sentences word-by-word from concepts, which is exactly
// right for the TARGET language (it must reflect the learner's vocabulary and
// any injected modifiers) but reads as a stilted word-for-word translation in
// the SUPPORT language wherever the engine's grammar rules for that language
// are incomplete. The templates ship human-authored translations
// (tpl.render[lang]) that are natural speech — so prefer those whenever they
// still describe the sentence, i.e. when no random adjective/number modifier
// was injected into this particular build. L6/L7 already show authored
// renders; this aligns the exposure and fill-in-the-blank cards.

export function chooseSupportSentence(tpl, supportLang, { generated, hadModifier }) {
  if (!hadModifier) {
    const authored = tpl?.render?.[supportLang];
    if (typeof authored === "string" && authored.trim()) {
      return { sentence: authored, source: "authored" };
    }
  }
  return { sentence: generated, source: "generated" };
}
