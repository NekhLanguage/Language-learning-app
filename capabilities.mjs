// capabilities.mjs
// Per-feature × per-language availability for AI-assisted features.
//
// The rule this file enforces: no AI feature is ever load-bearing for a
// language it hasn't been verified in. Every AI feature checks
// isFeatureAvailable() and degrades gracefully (hide the affordance or fall
// back to the non-AI behavior) when it returns false.
//
// This registry covers only the LANGUAGE dimension. Runtime availability
// (does this browser ship the Prompt API? is SpeechRecognition present?) is
// checked separately at the feature's call site — both gates must pass.
//
// To launch a feature in another language: verify quality with a native
// speaker, add the code here, and note it in the PR.

import { AVAILABLE_LANGUAGES } from "./languages.js";

export const ALL_LANGUAGE_CODES = AVAILABLE_LANGUAGES.map((l) => l.code);

// availability: "all" — every (target, support) pair.
// { targets: [...] }  — gate on the language being learned.
// { supports: [...] } — gate on the language explanations are shown in.
// Both keys present  — both must match.
const FEATURE_AVAILABILITY = {
  // Static, authoring-time text content. Validators enforce full coverage,
  // so these are available everywhere by construction.
  grammar_notes: "all",
  coaching: "all",

  // Per-word notes exist per (target, support) pair; content is added
  // support-language-first. The loader also checks the data itself — this
  // gate just controls where the affordance is offered.
  mnemonics: { supports: ["en"] },

  // On-device LLM grading (Chrome built-in AI). Small on-device models are
  // weak outside their supported set; start with the languages Chrome's
  // Prompt API handles well and expand only after verification.
  semantic_grading: { targets: ["en", "es", "ja"] },

  // Web Speech API recognition in Chrome covers all 13 app languages
  // (nb-NO included); runtime detection still gates actual use.
  speech_practice: "all",
};

export function isFeatureAvailable(feature, { target, support } = {}) {
  const spec = FEATURE_AVAILABILITY[feature];
  if (!spec) return false;
  if (spec === "all") return true;
  if (spec.targets && !spec.targets.includes(target)) return false;
  if (spec.supports && !spec.supports.includes(support)) return false;
  return true;
}

export function availableFeatures({ target, support } = {}) {
  return Object.keys(FEATURE_AVAILABILITY).filter((f) =>
    isFeatureAvailable(f, { target, support })
  );
}
