// Monthly referral credit run (Nekh 2026-09-17), scheduled on the 1st
// (netlify.toml) and callable by hand with the ADMIN_TOKEN header.
//
//   1. Commissions whose 30-day hold has passed: pending → available.
//   2. Per referrer with available commissions and an active subscription:
//      apply whole commissions, oldest first, up to one month's price
//      (1900 cents) as credit on their Stripe customer balance
//      (a negative balance transaction = credit on the next invoice).
//      Those commissions → credited, one payouts row (kind=credit).
//   3. Anything above the cap stays available for the cash tier.
//
// Env: SUPABASE_SECRET_KEY (required — the referral tables have no anon
// policies), STRIPE_SECRET_KEY (a restricted key with Customers: write and
// Subscriptions: read; without it step 1 still runs and step 2 is skipped
// with a loud log), ADMIN_TOKEN (optional, for manual runs).

const { SUPABASE_URL, secretKey } = require("./supabase");
const { groupByReferrer, planCredit, MONTHLY_PRICE_CENTS } = require("./referral_credit");

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

// The referrer's Stripe customer: the one carrying an active subscription,
// else the newest customer with that email, else null.
async function findCustomer(secret, email) {
  const q = encodeURIComponent(`email:'${email.replace(/'/g, "\\'")}'`);
  const found = await stripe(secret, "GET", `customers/search?query=${q}&limit=10`);
  const customers = Array.isArray(found.data) ? found.data : [];
  for (const c of customers) {
    const subs = await stripe(secret, "GET", `subscriptions?customer=${c.id}&status=active&limit=1`);
    if (Array.isArray(subs.data) && subs.data.length) return c.id;
  }
  return customers[0] ? customers[0].id : null;
}

async function run({ now = new Date(), dryRun = false } = {}) {
  const key = secretKey();
  if (!key) throw new Error("SUPABASE_SECRET_KEY unset");
  const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim() || null;
  const monthTag = now.toISOString().slice(0, 7);
  const report = { month: monthTag, released: 0, credited: [], skipped: [], dryRun };

  // 1. Release held commissions.
  const due = await sb(key, "GET", `commissions?status=eq.pending&available_at=lte.${encodeURIComponent(now.toISOString())}&select=id`);
  if (due.length && !dryRun) {
    await sb(key, "PATCH", `commissions?id=in.(${due.map((r) => r.id).join(",")})`, { status: "available" }, { Prefer: "return=minimal" });
  }
  report.released = due.length;

  // 2. Credit per referrer.
  const available = await sb(key, "GET", "commissions?status=eq.available&select=id,referrer_email,amount_cents,currency,earned_at&order=earned_at.asc");
  const groups = groupByReferrer(available);
  if (!groups.size) return report;
  if (!stripeSecret) {
    console.error("referralCreditRun: STRIPE_SECRET_KEY unset — credits skipped for", groups.size, "referrer(s)");
    report.skipped.push({ reason: "STRIPE_SECRET_KEY unset", referrers: groups.size });
    return report;
  }

  for (const [email, rows] of groups) {
    const plan = planCredit(rows, MONTHLY_PRICE_CENTS);
    if (!plan.totalCents) { report.skipped.push({ email, reason: "nothing creditable" }); continue; }

    const users = await sb(key, "GET", `users?email=eq.${encodeURIComponent(email)}&select=access_until`);
    if (!windowActive(users[0] && users[0].access_until)) { report.skipped.push({ email, reason: "no active subscription" }); continue; }

    const customer = await findCustomer(stripeSecret, email);
    if (!customer) { report.skipped.push({ email, reason: "no Stripe customer" }); continue; }

    if (dryRun) { report.credited.push({ email, cents: plan.totalCents, commissions: plan.ids.length, dryRun: true }); continue; }

    const tx = await stripe(stripeSecret, "POST", `customers/${customer}/balance_transactions`, {
      amount: String(-plan.totalCents),
      currency: "usd",
      description: `Zero to Hero referral credit, ${monthTag} (${plan.ids.length} commission${plan.ids.length === 1 ? "" : "s"})`,
    }, `referral-credit-${email}-${monthTag}`);

    await sb(key, "POST", "payouts", {
      referrer_email: email, amount_cents: plan.totalCents, currency: "usd", kind: "credit", stripe_reference: tx.id,
    }, { Prefer: "return=minimal" });
    const payout = await sb(key, "GET", `payouts?stripe_reference=eq.${encodeURIComponent(tx.id)}&select=id`);
    await sb(key, "PATCH", `commissions?id=in.(${plan.ids.join(",")})`, { status: "credited", payout_id: payout[0] ? payout[0].id : null }, { Prefer: "return=minimal" });
    report.credited.push({ email, cents: plan.totalCents, commissions: plan.ids.length, stripe: tx.id });
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
    console.log("referralCreditRun:", JSON.stringify(report));
    return json(200, report);
  } catch (err) {
    console.error("referralCreditRun failed:", err);
    return json(500, { error: String(err && err.message) });
  }
};

exports.run = run;
