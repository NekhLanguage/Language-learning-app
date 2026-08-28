// language-gate-core.mjs
// Pure decision logic for the per-language quality gate — extracted from
// the CLI (validate-language-gate.mjs) so the unit suite can pin every
// branch without spawning the engine.
//
// Contract (Nekh 2026-08-28): a VISIBLE language must diverge from its
// authored native corpus at most `threshold` of the time, OR stay within a
// frozen grandfather exception (which can only ever tighten), OR be hidden
// while it is being built. A visible language with no corpus at all fails.

export function evaluateLanguageGate({ rows, exceptions = {}, threshold }) {
  const failures = [];
  const queue = [];
  const graduated = [];
  const statuses = [];

  for (const r of rows) {
    const rate = r.total ? r.diverged / r.total : null;
    let status;
    if (rate === null) {
      status = r.hidden ? 'hidden (no corpus yet)' : 'FAIL — no authored corpus';
      if (!r.hidden) failures.push(`${r.code}: visible with no authored render corpus`);
    } else if (rate <= threshold) {
      status = r.hidden ? 'hidden (passing — ready to unhide?)' : 'pass';
    } else if (r.hidden) {
      status = 'hidden (over threshold — keep building)';
    } else if (typeof exceptions[r.code]?.maxRate === 'number') {
      const max = exceptions[r.code].maxRate;
      if (rate <= max) {
        status = `excepted (frozen ≤ ${(max * 100).toFixed(1)}%)`;
        queue.push({ ...r, rate });
      } else {
        status = `FAIL — worse than its frozen exception (${(rate * 100).toFixed(1)}% > ${(max * 100).toFixed(1)}%)`;
        failures.push(`${r.code}: rate ${(rate * 100).toFixed(1)}% exceeds its frozen exception ${(max * 100).toFixed(1)}%`);
      }
    } else {
      status = 'FAIL — over threshold, no exception';
      failures.push(`${r.code}: rate ${(rate * 100).toFixed(1)}% > ${(threshold * 100).toFixed(0)}% and not grandfathered`);
    }
    if (rate !== null && rate <= threshold && exceptions[r.code]) {
      graduated.push(r.code);
    }
    statuses.push({ code: r.code, rate, status });
  }

  queue.sort((a, b) => b.rate - a.rate);
  return { failures, queue, graduated, statuses };
}

// Tighten-only exception update: prunes languages now at/under the
// threshold, lowers an exception whose current rate improved, never raises
// one, never invents one.
export function tightenExceptions({ rows, exceptions, threshold }) {
  const next = {};
  for (const r of rows) {
    const ex = exceptions[r.code];
    const rate = r.total ? r.diverged / r.total : null;
    if (!ex || rate === null) continue;
    if (rate <= threshold) continue; // graduated — prune
    const maxRate = Math.min(ex.maxRate, Math.ceil(rate * 1000) / 1000);
    next[r.code] = { ...ex, maxRate };
  }
  return next;
}
