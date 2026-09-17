// Pure planning for the monthly referral credit run (see referralCreditRun.js).
// Kept free of I/O so it can be unit-tested.

const MONTHLY_PRICE_CENTS = 1900;

// Group available commissions by referrer, in earned order.
function groupByReferrer(rows) {
  const groups = new Map();
  for (const row of rows) {
    const email = String(row.referrer_email || "").toLowerCase();
    if (!email) continue;
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push(row);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.earned_at || "").localeCompare(String(b.earned_at || "")) || (a.id - b.id));
  }
  return groups;
}

// First-in-first-out: take whole commissions while the running total stays
// within the cap (one month of the referrer's own subscription). What is
// left stays "available" — the cash tier's business.
function planCredit(rows, capCents = MONTHLY_PRICE_CENTS, currency = "usd") {
  const selected = [];
  let total = 0;
  for (const row of rows) {
    if (String(row.currency || "usd").toLowerCase() !== currency) continue;
    const cents = Number(row.amount_cents) || 0;
    if (cents <= 0) continue;
    if (total + cents > capCents) break;
    selected.push(row.id);
    total += cents;
  }
  return { ids: selected, totalCents: total };
}

module.exports = { MONTHLY_PRICE_CENTS, groupByReferrer, planCredit };
