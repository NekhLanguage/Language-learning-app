// Pure planning for the monthly referral discount run
// (referralDiscountRun.js) and the numbers the referral card shows.
// Kept free of I/O so it can be unit-tested.
//
// Config lives in the environment, not in constants (Angus's spec):
//   REFERRAL_RATE_BPS  share of each referred payment, basis points
//                      (2000 = 20%). The website's webhook reads the same
//                      name when it writes commissions; this side only
//                      shows it.
//   REFERRAL_CAP_CENTS most discount one referrer can receive per calendar
//                      year, in US cents. Nekh 2026-09-17: enforced in USD
//                      as a fixed equivalent of NOK 2,000.

const DEFAULT_RATE_BPS = 2000;
const DEFAULT_CAP_CENTS = 19000;
const MONTHLY_PRICE_CENTS = 1900; // the $19 plan; the run reads the live price from Stripe

function intEnv(name, fallback) {
  const n = parseInt((process.env[name] || "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function config() {
  return {
    rateBps: intEnv("REFERRAL_RATE_BPS", DEFAULT_RATE_BPS),
    capCents: intEnv("REFERRAL_CAP_CENTS", DEFAULT_CAP_CENTS),
    monthlyPriceCents: MONTHLY_PRICE_CENTS,
  };
}

// Group commissions by referrer, oldest first.
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

// UTC calendar year of an ISO timestamp (the cap resets on 1 January).
function yearOf(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).getUTCFullYear() : NaN;
}

// Discount already applied to this referrer in the calendar year of `now`.
function appliedInYear(payouts, now = new Date()) {
  const year = now.getUTCFullYear();
  let total = 0;
  for (const p of payouts || []) {
    if ((p.kind || "discount") !== "discount") continue;
    if (yearOf(p.created_at) !== year) continue;
    total += Number(p.amount_cents) || 0;
  }
  return total;
}

// First-in-first-out: take whole commissions while the running total stays
// within BOTH limits — the referrer's own invoice amount (the invoice never
// goes below zero) and what is left of the yearly cap. Anything not taken
// stays "available" in the ledger for a later run.
function planDiscount(rows, { priceCents, capRemainingCents, currency = "usd" }) {
  const limitCents = Math.max(0, Math.min(Number(priceCents) || 0, Number(capRemainingCents) || 0));
  const ids = [];
  let totalCents = 0;
  for (const row of rows) {
    if (String(row.currency || "usd").toLowerCase() !== currency) continue;
    const cents = Number(row.amount_cents) || 0;
    if (cents <= 0) continue;
    if (totalCents + cents > limitCents) break;
    ids.push(row.id);
    totalCents += cents;
  }
  return { ids, totalCents, limitCents, cappedByYear: capRemainingCents < priceCents };
}

module.exports = {
  DEFAULT_RATE_BPS,
  DEFAULT_CAP_CENTS,
  MONTHLY_PRICE_CENTS,
  config,
  groupByReferrer,
  yearOf,
  appliedInYear,
  planDiscount,
};
