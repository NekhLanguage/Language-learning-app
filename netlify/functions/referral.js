// Referral program: the learner's own referral code, link and rewards.
// Reworked with the one-time app (Dan 2026-10-22): a friend who buys the
// app with the code pays 20% less, once; the referrer gets one free month
// of Anna per friend who buys (the website's Stripe webhook grants it —
// a window month, or for an Anna subscriber an invoice credit applied by
// referralRewardRun). This function only reads the rows and creates the
// code.
//
//   GET  → { code, link, eligible, acceptedTermsAt, stats, config }
//          code/link are null until the learner has accepted the terms.
//          stats: { friends, monthsEarned, monthsPending }.
//   POST { accept: true } → creates the code (app owners only) and
//          returns the same shape.
//
// Identity comes from the Supabase session token. The referral tables have
// no anon policies, so this needs SUPABASE_SECRET_KEY (503 without it).

const { SUPABASE_URL, secretKey } = require("./supabase");
const { verifySession, unauthorizedResponse } = require("./auth");
const { tierOf } = require("./entitlement");

// Two-sided referral (Dan 2026-10-09): the friend's link routes through
// the referralCheckout function so Stripe applies the 20%-off-first-
// payment coupon before the friend sees the price. `/r/<code>` is the
// public, share-friendly path (netlify.toml rewrites it to the
// function); the plain Stripe payment link stays for direct $19 buys.
const REFERRAL_SHARE_BASE = "https://zerotoherolanguage.netlify.app/r";
const MAX_CODE_ATTEMPTS = 20;

// What the card shows. The coupon and the reward live in Stripe and the
// webhook; these mirror them for the copy.
const CONFIG = { appPriceCents: 1900, friendPriceCents: 1520, friendPct: 20, rewardDays: 30 };

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
  return `${REFERRAL_SHARE_BASE}/${encodeURIComponent(code)}`;
}

async function getRows(key, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders(key) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} read ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Referrals that earned a reward. Before migrations/referral_anna_reward.sql
// runs, the reward columns don't exist (400): every referral counts as one
// month, none pending.
async function rewardRows(key, email) {
  const base = `referrals?referrer_email=eq.${encodeURIComponent(email)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${base}&anna_reward_granted_at=not.is.null&select=anna_reward_kind,anna_reward_applied_at`, { headers: restHeaders(key) });
  if (res.status === 400) {
    const all = await getRows(key, `${base}&select=id`);
    return all.map(() => ({ anna_reward_kind: "window", anna_reward_applied_at: null }));
  }
  if (!res.ok) throw new Error(`referrals read ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function loadState(key, email) {
  const [users, codes] = await Promise.all([
    getRows(key, `users?email=eq.${encodeURIComponent(email)}&select=access_tier`),
    getRows(key, `referral_codes?email=eq.${encodeURIComponent(email)}&select=code,accepted_terms_at`),
  ]);
  // Anyone who owns the app can refer: the reward extends whatever Anna
  // access they have, lapsed or not.
  const eligible = tierOf(users[0] || null) === "paid";
  const row = codes[0] || null;
  const stats = { friends: 0, monthsEarned: 0, monthsPending: 0 };
  if (row) {
    const rewards = await rewardRows(key, email);
    stats.friends = rewards.length;
    stats.monthsEarned = rewards.length;
    stats.monthsPending = rewards.filter((r) => r.anna_reward_kind === "pending" && !r.anna_reward_applied_at).length;
  }
  return {
    code: row ? row.code : null,
    link: row ? linkFor(row.code) : null,
    eligible,
    acceptedTermsAt: row ? row.accepted_terms_at : null,
    stats,
    config: CONFIG,
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
    if (!state.eligible) return json(403, { error: "Referral codes are for app owners", ...state });

    await createCode(key, email);
    return json(200, await loadState(key, email));
  } catch (err) {
    console.error("referral error:", err);
    return json(500, { error: "Server error" });
  }
};

exports.codeFor = codeFor;
exports.linkFor = linkFor;
