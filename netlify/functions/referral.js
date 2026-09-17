// Referral program (Angus's v1 spec, Nekh 2026-09-17): the learner's own
// referral code, link and earnings. A share of every payment a referred
// subscriber makes (REFERRAL_RATE_BPS, 20% by default) comes off the
// referrer's own subscription while both stay subscribed; the website's
// Stripe webhook writes the attribution and commission rows, the monthly
// discount run applies them, this function only reads them and creates
// the code.
//
//   GET  → { code, link, eligible, acceptedTermsAt, stats, config }
//          code/link are null until the learner has accepted the terms.
//   POST { accept: true } → creates the code (active subscribers only) and
//          returns the same shape.
//
// Identity comes from the Supabase session token. The referral tables have
// no anon policies, so this needs SUPABASE_SECRET_KEY (503 without it).

const { SUPABASE_URL, secretKey } = require("./supabase");
const { verifySession, unauthorizedResponse, subscriptionActive } = require("./auth");
const { config, appliedInYear } = require("./referral_discount");

const PAYMENT_LINK = "https://buy.stripe.com/00w00i2G0ekMblW6WI9sk05";
const MAX_CODE_ATTEMPTS = 20;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function restHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// ZTH-<up to 8 letters/digits of the email's local part>, then ZTH-…01,
// ZTH-…02 … on collisions. Always uppercase; the checkout field and the
// webhook normalise the same way.
function codeFor(email, attempt = 0) {
  const local = String(email || "").split("@")[0];
  const base = local.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "FRIEND";
  return attempt === 0 ? `ZTH-${base}` : `ZTH-${base}${String(attempt).padStart(2, "0")}`;
}

function linkFor(code) {
  return `${PAYMENT_LINK}?client_reference_id=${encodeURIComponent(code)}`;
}

async function getRows(key, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders(key) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} read ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function loadState(key, email) {
  const cfg = config();
  const [users, codes] = await Promise.all([
    getRows(key, `users?email=eq.${encodeURIComponent(email)}&select=access_until`),
    getRows(key, `referral_codes?email=eq.${encodeURIComponent(email)}&select=code,accepted_terms_at`),
  ]);
  const eligible = !!users[0] && subscriptionActive(users[0].access_until);
  const row = codes[0] || null;
  // availableCents: earned, waiting for the next monthly run.
  // appliedCents: taken off invoices, lifetime. appliedThisYearCents counts
  // against the yearly cap. lifetimeCents = available + applied.
  const stats = { activeReferrals: 0, availableCents: 0, appliedCents: 0, appliedThisYearCents: 0, lifetimeCents: 0 };
  if (row) {
    const [referrals, commissions, payouts] = await Promise.all([
      getRows(key, `referrals?referrer_email=eq.${encodeURIComponent(email)}&status=eq.active&select=id`),
      getRows(key, `commissions?referrer_email=eq.${encodeURIComponent(email)}&select=amount_cents,status`),
      getRows(key, `payouts?referrer_email=eq.${encodeURIComponent(email)}&kind=eq.discount&select=amount_cents,kind,created_at`),
    ]);
    stats.activeReferrals = referrals.length;
    for (const c of commissions) {
      const cents = Number(c.amount_cents) || 0;
      if (c.status === "available") stats.availableCents += cents;
      else if (c.status === "applied") stats.appliedCents += cents;
    }
    stats.lifetimeCents = stats.availableCents + stats.appliedCents;
    stats.appliedThisYearCents = appliedInYear(payouts);
  }
  return {
    code: row ? row.code : null,
    link: row ? linkFor(row.code) : null,
    eligible,
    acceptedTermsAt: row ? row.accepted_terms_at : null,
    stats,
    config: cfg,
  };
}

async function createCode(key, email) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = codeFor(email, attempt);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/referral_codes`, {
      method: "POST",
      headers: restHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ email, code }),
    });
    if (res.ok) return code;
    const text = await res.text();
    // 409: either the code is taken (try the next one) or this email
    // already has a code (a concurrent request won) — the caller re-reads.
    if (res.status === 409) {
      if (/referral_codes_pkey/.test(text)) return null;
      continue;
    }
    throw new Error(`referral_codes insert ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new Error("could not find a free referral code");
}

exports.handler = async (event) => {
  try {
    const key = secretKey();
    if (!key) {
      console.error("referral: SUPABASE_SECRET_KEY unset");
      return json(503, { error: "Referrals not configured (SUPABASE_SECRET_KEY unset)" });
    }
    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();
    const email = session.email;

    if (event.httpMethod === "GET") {
      return json(200, await loadState(key, email));
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    if (body.accept !== true) return json(400, { error: "Accept the referral terms to get a code" });

    const state = await loadState(key, email);
    if (state.code) return json(200, state);
    if (!state.eligible) return json(403, { error: "Referral codes are for active subscribers", ...state });

    await createCode(key, email);
    return json(200, await loadState(key, email));
  } catch (err) {
    console.error("referral error:", err);
    return json(500, { error: "Server error" });
  }
};

exports.codeFor = codeFor;
exports.linkFor = linkFor;
