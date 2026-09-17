// Monthly referral discount run (Angus's v1 spec, Nekh 2026-09-17),
// scheduled on the 1st (netlify.toml) and callable by hand with the
// ADMIN_TOKEN header (?dry=1 plans without touching Stripe or the ledger).
//
// Per referrer with available commissions and an active subscription:
//   1. Read this year's applied discount (payouts, kind=discount) and the
//      referrer's live Stripe subscription price.
//   2. Take whole commissions, oldest first, up to the smaller of that
//      price and what is left of the yearly cap (never below zero, never
//      over the cap).
//   3. Create a NEGATIVE invoice item on the subscription: Stripe pulls it
//      onto the next invoice as a "Referral discount" line, so the invoice
//      itself shows the reduced amount. No customer balance, no cash.
//   4. One payouts row (kind=discount, period, cap in force); the
//      commissions → applied, pointing at it.
// Commissions above the limit stay available for a later run.
//
// Env: SUPABASE_SECRET_KEY (required — the referral tables have no anon
// policies), STRIPE_SECRET_KEY (a restricted key with Customers: write,
// Subscriptions: read, Invoices: write for invoice items; without it the
// run reports and skips), REFERRAL_CAP_CENTS / REFERRAL_RATE_BPS (config,
// see referral_discount.js), ADMIN_TOKEN (optional, manual runs).

const { SUPABASE_URL, secretKey } = require("./supabase");
const { config, groupByReferrer, appliedInYear, planDiscount } = require("./referral_discount");

const STRIPE_API = "https://api.stripe.com/v1";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function sb(key, method, path, body, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(key, extra),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return method === "GET" ? res.json() : null;
}

async function stripe(secret, method, path, form = null, idempotencyKey = null) {
  const headers = { Authorization: `Bearer ${secret}` };
  let body;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}/${path}`, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${method} ${path.split("?")[0]} ${res.status}: ${(data.error && data.error.message) || ""}`);
  return data;
}

function windowActive(accessUntil) {
  if (!accessUntil) return false;
  if (accessUntil === "infinity") return true;
  const t = Date.parse(accessUntil);
  return Number.isFinite(t) && t > Date.now();
}

// The referrer's active Stripe subscription: customer id, subscription id
// and the invoice amount it bills (sum of its items), or null.
async function findSubscription(secret, email) {
  const q = encodeURIComponent(`email:'${email.replace(/'/g, "\\'")}'`);
  const found = await stripe(secret, "GET", `customers/search?query=${q}&limit=10`);
  const customers = Array.isArray(found.data) ? found.data : [];
  for (const c of customers) {
    const subs = await stripe(secret, "GET", `subscriptions?customer=${c.id}&status=active&limit=1`);
    const sub = Array.isArray(subs.data) && subs.data[0];
    if (!sub) continue;
    let priceCents = 0;
    let currency = "usd";
    for (const item of (sub.items && sub.items.data) || []) {
      const unit = Number(item.price && item.price.unit_amount) || 0;
      priceCents += unit * (Number(item.quantity) || 1);
      if (item.price && item.price.currency) currency = String(item.price.currency).toLowerCase();
    }
    return { customerId: c.id, subscriptionId: sub.id, priceCents, currency };
  }
  return null;
}

async function run({ now = new Date(), dryRun = false } = {}) {
  const key = secretKey();
  if (!key) throw new Error("SUPABASE_SECRET_KEY unset");
  const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim() || null;
  const cfg = config();
  const monthTag = now.toISOString().slice(0, 7);
  const yearStart = `${now.getUTCFullYear()}-01-01T00:00:00Z`;
  const report = { month: monthTag, rateBps: cfg.rateBps, capCents: cfg.capCents, applied: [], skipped: [], dryRun };

  const available = await sb(key, "GET", "commissions?status=eq.available&select=id,referrer_email,amount_cents,currency,earned_at&order=earned_at.asc");
  const groups = groupByReferrer(available);
  if (!groups.size) return report;
  if (!stripeSecret) {
    console.error("referralDiscountRun: STRIPE_SECRET_KEY unset — discounts skipped for", groups.size, "referrer(s)");
    report.skipped.push({ reason: "STRIPE_SECRET_KEY unset", referrers: groups.size });
    return report;
  }

  for (const [email, rows] of groups) {
    const users = await sb(key, "GET", `users?email=eq.${encodeURIComponent(email)}&select=access_until`);
    if (!windowActive(users[0] && users[0].access_until)) { report.skipped.push({ email, reason: "no active subscription" }); continue; }

    const payouts = await sb(key, "GET", `payouts?referrer_email=eq.${encodeURIComponent(email)}&kind=eq.discount&created_at=gte.${encodeURIComponent(yearStart)}&select=amount_cents,kind,created_at`);
    const ytdCents = appliedInYear(payouts, now);
    const capRemainingCents = cfg.capCents - ytdCents;
    if (capRemainingCents <= 0) { report.skipped.push({ email, reason: "yearly cap reached", ytdCents, capCents: cfg.capCents }); continue; }

    const sub = await findSubscription(stripeSecret, email);
    if (!sub) { report.skipped.push({ email, reason: "no active Stripe subscription" }); continue; }
    if (sub.currency !== "usd") { report.skipped.push({ email, reason: `subscription billed in ${sub.currency}` }); continue; }

    const plan = planDiscount(rows, { priceCents: sub.priceCents, capRemainingCents });
    if (!plan.totalCents) { report.skipped.push({ email, reason: "nothing fits under the limit", limitCents: plan.limitCents, ytdCents }); continue; }

    const entry = { email, cents: plan.totalCents, commissions: plan.ids.length, ytdCents: ytdCents + plan.totalCents, capCents: cfg.capCents, cappedByYear: plan.cappedByYear };
    if (dryRun) { report.applied.push({ ...entry, dryRun: true }); continue; }

    const item = await stripe(stripeSecret, "POST", "invoiceitems", {
      customer: sub.customerId,
      subscription: sub.subscriptionId,
      amount: String(-plan.totalCents),
      currency: "usd",
      description: `Referral discount, ${monthTag} (${plan.ids.length} referral payment${plan.ids.length === 1 ? "" : "s"})`,
      "metadata[referral_run]": monthTag,
    }, `referral-discount-${email}-${monthTag}`);

    await sb(key, "POST", "payouts", {
      referrer_email: email, amount_cents: plan.totalCents, currency: "usd", kind: "discount",
      stripe_reference: item.id, period: monthTag, cap_cents: cfg.capCents,
    }, { Prefer: "return=minimal" });
    const payout = await sb(key, "GET", `payouts?stripe_reference=eq.${encodeURIComponent(item.id)}&select=id`);
    await sb(key, "PATCH", `commissions?id=in.(${plan.ids.join(",")})`, { status: "applied", payout_id: payout[0] ? payout[0].id : null }, { Prefer: "return=minimal" });
    report.applied.push({ ...entry, stripe: item.id });
  }
  return report;
}

exports.handler = async (event) => {
  // Netlify's scheduler POSTs with a body of { next_run }; a manual call
  // must carry the admin token.
  const scheduled = !!(event.headers && (event.headers["x-nf-event"] === "schedule"));
  if (!scheduled) {
    const token = (process.env.ADMIN_TOKEN || "").trim();
    const given = event.headers && (event.headers["x-admin-token"] || event.headers["X-Admin-Token"]);
    if (!token || given !== token) return json(403, { error: "Forbidden" });
  }
  const dryRun = !scheduled && !!(event.queryStringParameters && event.queryStringParameters.dry === "1");
  try {
    const report = await run({ dryRun });
    console.log("referralDiscountRun:", JSON.stringify(report));
    return json(200, report);
  } catch (err) {
    console.error("referralDiscountRun failed:", err);
    return json(500, { error: String(err && err.message) });
  }
};

exports.run = run;
