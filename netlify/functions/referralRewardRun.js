// Daily referral reward run (referral rework, Dan 2026-10-22), scheduled
// in netlify.toml and callable by hand with the ADMIN_TOKEN header
// (?dry=1 plans without touching Stripe or the database).
//
// A friend's purchase earns the referrer one free month of Anna. The
// website's Stripe webhook grants it at once as 30 more days of Anna —
// except for a referrer who subscribes to Anna, where extra days would be
// swallowed by the next paid period. Those rewards are left 'pending'
// (referrals.anna_reward_kind) and this run settles them:
//   - live Anna subscription in Stripe (active or trialing) → a -$19
//     invoice item on it: the next Anna invoice shows a "Referral: free
//     month of Anna" line. Several pending months stack; anything past one
//     invoice carries over as Stripe customer credit to the next ones.
//     Kind becomes 'invoice_credit'.
//   - no live subscription (they cancelled since) → 30 days added to
//     users.access_until like any other referrer. Kind becomes 'window'.
// Each row is stamped anna_reward_applied_at, and the invoice item carries
// an idempotency key per referral row, so a re-run never doubles a reward.
//
// Replaces the 2026-09-17 monthly discount run (20% of referred payments
// off the referrer's own subscription), retired with the one-time app.
//
// Env: SUPABASE_SECRET_KEY (required — the referral tables have no anon
// policies), STRIPE_SECRET_KEY (restricted: Customers read, Subscriptions
// read, Invoice items write; without it pending rewards wait), ANNA_PRICE_ID
// / ANNA_STRIPE_PRODUCT_ID (which subscription is Anna), ADMIN_TOKEN.

const { SUPABASE_URL, secretKey } = require("./supabase");

const STRIPE_API = "https://api.stripe.com/v1";
const REWARD_CENTS = 1900;
const REWARD_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_ANNA_PRODUCT_ID = "prod_VVNROZf71XnOfV";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function sb(key, method, path, body, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return method === "GET" || /representation/.test(extra.Prefer || "") ? res.json() : null;
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

function annaProductId() {
  return (process.env.ANNA_STRIPE_PRODUCT_ID || "").trim() || DEFAULT_ANNA_PRODUCT_ID;
}

// Is this subscription Anna? By its metadata (annaCheckout stamps
// sku=zth_anna) or by any item billing the Anna product.
function isAnnaSubscription(sub) {
  if (sub && sub.metadata && sub.metadata.sku === "zth_anna") return true;
  const items = (sub && sub.items && sub.items.data) || [];
  return items.some((it) => {
    const product = it.price && it.price.product;
    return (typeof product === "string" ? product : product && product.id) === annaProductId();
  });
}

// The referrer's live Anna subscription (active or trialing): { customerId,
// subscriptionId } or null.
async function findAnnaSubscription(secret, email) {
  const q = encodeURIComponent(`email:'${email.replace(/'/g, "\\'")}'`);
  const found = await stripe(secret, "GET", `customers/search?query=${q}&limit=10`);
  for (const c of Array.isArray(found.data) ? found.data : []) {
    const subs = await stripe(secret, "GET", `subscriptions?customer=${c.id}&status=all&limit=20`);
    const live = (Array.isArray(subs.data) ? subs.data : [])
      .find((s) => (s.status === "active" || s.status === "trialing") && isAnnaSubscription(s));
    if (live) return { customerId: c.id, subscriptionId: live.id };
  }
  return null;
}

async function addWindowMonth(key, email) {
  const rows = await sb(key, "GET", `users?email=eq.${encodeURIComponent(email)}&select=access_until`);
  const existing = rows[0] && rows[0].access_until;
  if (existing === "infinity") return;
  const t = existing ? Date.parse(existing) : NaN;
  const base = Number.isFinite(t) && t > Date.now() ? t : Date.now();
  await sb(key, "PATCH", `users?email=eq.${encodeURIComponent(email)}`, { access_until: new Date(base + REWARD_MS).toISOString() }, { Prefer: "return=minimal" });
}

async function run({ dryRun = false } = {}) {
  const key = secretKey();
  if (!key) throw new Error("SUPABASE_SECRET_KEY unset");
  const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim() || null;
  const report = { applied: [], skipped: [], dryRun };

  const pending = await sb(key, "GET", "referrals?anna_reward_kind=eq.pending&anna_reward_applied_at=is.null&select=id,referrer_email,anna_reward_granted_at&order=anna_reward_granted_at.asc");
  if (!pending.length) return report;
  if (!stripeSecret) {
    console.error("referralRewardRun: STRIPE_SECRET_KEY unset —", pending.length, "pending reward(s) wait");
    report.skipped.push({ reason: "STRIPE_SECRET_KEY unset", rewards: pending.length });
    return report;
  }

  for (const row of pending) {
    const email = String(row.referrer_email || "").toLowerCase();
    try {
      const sub = await findAnnaSubscription(stripeSecret, email);
      const kind = sub ? "invoice_credit" : "window";
      if (dryRun) { report.applied.push({ id: row.id, email, kind, dryRun: true }); continue; }
      // Claim first (only a still-unapplied row comes back), then act: a
      // concurrent run can't apply the same reward twice.
      const claimed = await sb(key, "PATCH", `referrals?id=eq.${row.id}&anna_reward_applied_at=is.null&select=id`,
        { anna_reward_applied_at: new Date().toISOString(), anna_reward_kind: kind }, { Prefer: "return=representation" });
      if (!claimed.length) continue;
      let reference = null;
      try {
        if (sub) {
          const item = await stripe(stripeSecret, "POST", "invoiceitems", {
            customer: sub.customerId,
            subscription: sub.subscriptionId,
            amount: String(-REWARD_CENTS),
            currency: "usd",
            description: "Referral: free month of Anna",
            "metadata[referral_id]": String(row.id),
          }, `referral-reward-${row.id}`);
          reference = item.id;
        } else {
          await addWindowMonth(key, email);
        }
      } catch (err) {
        // Un-claim so tomorrow's run tries again.
        await sb(key, "PATCH", `referrals?id=eq.${row.id}`, { anna_reward_applied_at: null, anna_reward_kind: "pending" }, { Prefer: "return=minimal" }).catch(() => {});
        throw err;
      }
      report.applied.push({ id: row.id, email, kind, stripe: reference });
    } catch (err) {
      console.error("referralRewardRun: reward", row.id, "failed:", err && err.message);
      report.skipped.push({ id: row.id, email, reason: String(err && err.message) });
    }
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
    console.log("referralRewardRun:", JSON.stringify(report));
    return json(200, report);
  } catch (err) {
    console.error("referralRewardRun failed:", err);
    return json(500, { error: String(err && err.message) });
  }
};

exports.run = run;
exports.isAnnaSubscription = isAnnaSubscription;
