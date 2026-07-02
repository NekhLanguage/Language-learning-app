// coaching.mjs
// Pure resolution logic for personalized coaching lines (coaching_lines.json):
// milestone celebrations keyed reason × journey stage × support language, and
// rotating session-complete lines. app.js supplies the data and falls back to
// the legacy uiStrings templates when a lookup misses, so partially-filled
// content never regresses any language.

// 50/100 → early, 150/200 → mid, 250+ → late.
export function stageForMilestone(n) {
  if (n < 150) return "early";
  if (n < 250) return "mid";
  return "late";
}

function fill(line, { detail = "", n = 0, langName = "" } = {}) {
  return line
    .replaceAll("{detail}", detail)
    .replaceAll("{n}", String(n))
    .replaceAll("{lang}", langName);
}

// Resolves a milestone line. Returns null when the matrix has no usable
// entry (caller falls back to the legacy single-line templates).
// A reason line that needs {detail} is only used when the learner actually
// gave a detail; otherwise the generic entry is used instead.
export function coachingMilestoneLine(lines, { type, detail, n, supportLang, langName }) {
  const milestones = lines?.milestones;
  if (!milestones) return null;

  const stage = stageForMilestone(n);
  const trimmedDetail = (detail || "").trim();

  const pick = (reasonKey) => {
    const line = milestones[reasonKey]?.[stage]?.[supportLang];
    if (typeof line !== "string" || !line.trim()) return null;
    if (line.includes("{detail}") && !trimmedDetail) return null;
    return fill(line, { detail: trimmedDetail, n, langName });
  };

  return pick(type) ?? pick("generic");
}

// Rotates through the session-complete pool by session number (1-based).
// Returns null when the pool is missing/empty.
export function sessionCompleteLine(lines, sessionNumber, supportLang) {
  const pool = lines?.sessionComplete?.[supportLang];
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const idx = (Math.max(1, sessionNumber) - 1) % pool.length;
  const line = pool[idx];
  if (typeof line !== "string" || !line.trim()) return null;
  return fill(line, { n: sessionNumber });
}
