// grading.mjs
// Semantic grading for Level 7 free production via Chrome's built-in
// on-device AI (Prompt API). Zero cost, runs locally, no data leaves the
// device. This is a progressive enhancement on top of the strict/loose
// string matching: it only runs when the strict check already said
// "incorrect", and any failure (API absent, timeout, malformed output)
// returns null so the caller keeps the strict verdict. Language coverage is
// gated separately by capabilities.mjs (semantic_grading).

export const SEMANTIC_GRADING_TIMEOUT_MS = 4000;

export function promptApiAvailable(root = globalThis) {
  return typeof root.LanguageModel?.create === "function";
}

export function buildGradingPrompt({ userInput, targetSentence, supportSentence, langLabel }) {
  return [
    `You are grading a beginner language learner's typed answer in ${langLabel}.`,
    `Expected sentence: "${targetSentence}"`,
    supportSentence ? `Meaning (reference translation): "${supportSentence}"` : "",
    `Learner's answer: "${userInput}"`,
    ``,
    `Is the learner's answer an acceptable way to express the same meaning in ${langLabel}?`,
    `Accept natural variations (different but correct word choice, contractions, optional pronouns).`,
    `Reject wrong meaning, wrong conjugation, or ungrammatical sentences.`,
    `Reply with ONLY this JSON: {"acceptable": true|false, "feedback": "<one short sentence for the learner>"}`,
  ].filter(Boolean).join("\n");
}

// Extracts and validates the verdict JSON from raw model output.
// Returns { acceptable, feedback } or null.
export function parseVerdict(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.acceptable !== "boolean") return null;
    const feedback = typeof obj.feedback === "string" ? obj.feedback.trim().slice(0, 200) : "";
    return { acceptable: obj.acceptable, feedback };
  } catch {
    return null;
  }
}

export async function gradeSemantically(input, opts = {}) {
  const root = opts.root || globalThis;
  const timeoutMs = opts.timeoutMs ?? SEMANTIC_GRADING_TIMEOUT_MS;
  if (!promptApiAvailable(root)) return null;

  try {
    return await Promise.race([
      (async () => {
        const session = await root.LanguageModel.create();
        try {
          const raw = await session.prompt(buildGradingPrompt(input));
          return parseVerdict(raw);
        } finally {
          session.destroy?.();
        }
      })(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}
