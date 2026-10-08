// Leaderboard v1 (Nekh 2026-10-02): the community board.
//
//   GET  -> { top: { words: [...], anna: [...] }, me, limits }
//        top.* are the TOP_N learners who joined, by words mastered at
//        level 7 and by words encountered with Anna; each row is
//        { name, words, anna }. `me` is the caller's own row when the
//        request carries a session ({ joined, name, words, anna,
//        rankWords, rankAnna }), null otherwise — the list itself is
//        public to anyone signed in, the name is the only thing shown.
//   GET ?period=week -> the same shape for THIS week (ISO week, UTC): the
//        counts are what each learner gained since Monday 00:00 UTC
//        (lb_words_week / lb_anna_week, kept by the users_lb_weekly trigger,
//        migrations/leaderboard_weekly.sql). Fetched only when the learner
//        opens the weekly view, so the default board costs nothing extra.
//   POST { name }       -> join the board (or rename) under that name.
//   POST { leave: true } -> leave the board (counters keep updating, the
//        row just isn't shown).
//
// The counters themselves are written by saveUser on every save
// (leaderboardStats.js), so this function only ever reads them. Nothing
// here runs at boot: the app fetches it when the learner opens the board.

const { SUPABASE_URL, usersKey, restHeaders, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse } = require("./auth");
const { normalizeDisplayName, computeLeaderboardStats, isoWeekKey, MIN_NAME, MAX_NAME } = require("./leaderboardStats");

const TOP_N = 25;
const ROW_SELECT = "lb_name,lb_words,lb_anna";
const ME_SELECT = `${ROW_SELECT},lb_updated_at`;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// PostgREST answers 400 PGRST204 ("Could not find the 'lb_words' column")
// until migrations/leaderboard.sql has run. Make that a clear 503 rather
// than a generic failure.
function notMigrated(text) {
  return /lb_(name|words|anna|updated_at|week)/.test(String(text || ""));
}

// Only rows stamped with this week count on the weekly board.
const weekFilter = (wk) => `&lb_week=eq.${encodeURIComponent(wk)}`;

async function weekTopBy(key, column, wk) {
  const res = await rest(
    key,
    `?select=lb_name,lb_words_week,lb_anna_week&lb_name=not.is.null${weekFilter(wk)}&${column}=gt.0&order=${column}.desc,lb_updated_at.asc.nullslast&limit=${TOP_N}`
  );
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard weekly read returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    name: String(row.lb_name || ""),
    words: Math.max(0, Number(row.lb_words_week) || 0),
    anna: Math.max(0, Number(row.lb_anna_week) || 0),
  }));
}

// The caller's own row for this week: 0 / 0 when they haven't saved since
// Monday (their lb_week is an older week). Rank counts learners strictly
// ahead among this week's rows.
async function weekMeFor(key, email, wk) {
  const res = await rest(key, `?select=lb_name,lb_week,lb_words_week,lb_anna_week&email=eq.${encodeURIComponent(email)}`);
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard weekly me read returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
  const current = row.lb_week === wk;
  const words = current ? Math.max(0, Number(row.lb_words_week) || 0) : 0;
  const anna = current ? Math.max(0, Number(row.lb_anna_week) || 0) : 0;
  if (!row.lb_name) return { joined: false, name: null, words, anna, rankWords: null, rankAnna: null };
  const [aheadWords, aheadAnna] = await Promise.all([
    countAhead(key, "lb_words_week", words, weekFilter(wk)),
    countAhead(key, "lb_anna_week", anna, weekFilter(wk)),
  ]);
  return { joined: true, name: String(row.lb_name), words, anna, rankWords: aheadWords + 1, rankAnna: aheadAnna + 1 };
}

class NotMigratedError extends Error {}

async function rest(key, path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users${path}`, {
    ...init,
    headers: restHeaders(key, init.headers || {}),
  });
  return res;
}

function rowToEntry(row) {
  return {
    name: String(row.lb_name || ""),
    words: Math.max(0, Number(row.lb_words) || 0),
    anna: Math.max(0, Number(row.lb_anna) || 0),
  };
}

async function topBy(key, column) {
  const res = await rest(
    key,
    `?select=${ROW_SELECT}&lb_name=not.is.null&order=${column}.desc,lb_updated_at.asc.nullslast&limit=${TOP_N}`
  );
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard top read returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(rowToEntry);
}

// How many learners on the board are strictly ahead on `column`: the
// caller's rank is that plus one. A HEAD with count=exact costs no rows.
async function countAhead(key, column, value, extra = "") {
  const res = await rest(
    key,
    `?select=email&lb_name=not.is.null${extra}&${column}=gt.${encodeURIComponent(value)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } }
  );
  if (!res.ok) throw new Error(`leaderboard count returned ${res.status}`);
  const range = res.headers.get("content-range") || "";
  const m = /\/(\d+)\s*$/.exec(range);
  return m ? Number(m[1]) : 0;
}

// An account that has not saved since the board shipped still has the
// column defaults (0 / 0, lb_updated_at NULL) although its blob may hold
// months of progress. Compute the counters from the stored blob once, here,
// and write them so every later read is the cheap column read again. The
// blob read is the expensive part (a full account is ~450 KB), which is
// why it only happens while lb_updated_at is NULL.
async function refreshCounters(key, email) {
  const res = await rest(key, `?select=data&email=eq.${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`leaderboard blob read returned ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  const blob = Array.isArray(rows) && rows.length ? rows[0].data : null;
  const stats = computeLeaderboardStats(blob);
  const patch = await rest(key, `?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ lb_words: stats.words, lb_anna: stats.anna, lb_updated_at: new Date().toISOString() }),
  });
  if (!patch.ok) console.warn("leaderboard: counter refresh write failed:", patch.status, await patch.text());
  return stats;
}

async function meFor(key, email) {
  const res = await rest(key, `?select=${ME_SELECT}&email=eq.${encodeURIComponent(email)}`);
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard me read returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
  if (!row.lb_updated_at) {
    const stats = await refreshCounters(key, email);
    row.lb_words = stats.words;
    row.lb_anna = stats.anna;
  }
  const entry = rowToEntry(row);
  const joined = !!row.lb_name;
  if (!joined) return { joined: false, name: null, words: entry.words, anna: entry.anna, rankWords: null, rankAnna: null };
  const [aheadWords, aheadAnna] = await Promise.all([
    countAhead(key, "lb_words", entry.words),
    countAhead(key, "lb_anna", entry.anna),
  ]);
  return { joined: true, name: entry.name, words: entry.words, anna: entry.anna, rankWords: aheadWords + 1, rankAnna: aheadAnna + 1 };
}

async function setName(key, email, name) {
  const res = await rest(key, `?email=eq.${encodeURIComponent(email)}&select=email`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ lb_name: name }),
  });
  if (res.status === 409) return { ok: false, code: "name_taken" };
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard name write returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return { ok: false, code: "no_row" };
  return { ok: true };
}

exports.handler = async (event) => {
  try {
    const key = usersKey();
    if (!key) return missingKeyResponse();

    const method = String(event.httpMethod || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const limits = { minName: MIN_NAME, maxName: MAX_NAME, top: TOP_N };

    if (method === "GET") {
      // The board is for signed-in learners only — a session is required,
      // the row shown for the caller comes from it.
      const session = await verifySession(event);
      if (!session) return unauthorizedResponse();
      const period = event.queryStringParameters?.period === "week" ? "week" : "all";
      if (period === "week") {
        const wk = isoWeekKey();
        const [words, anna, me] = await Promise.all([
          weekTopBy(key, "lb_words_week", wk),
          weekTopBy(key, "lb_anna_week", wk),
          weekMeFor(key, session.email, wk),
        ]);
        return json(200, { period, week: wk, top: { words, anna }, me, limits });
      }
      const [words, anna, me] = await Promise.all([
        topBy(key, "lb_words"),
        topBy(key, "lb_anna"),
        meFor(key, session.email),
      ]);
      return json(200, { period, top: { words, anna }, me, limits });
    }

    const session = await verifySession(event);
    if (!session) return unauthorizedResponse();

    let body = {};
    try {
      body = JSON.parse(event.body || "{}") || {};
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    if (body.leave === true) {
      const result = await setName(key, session.email, null);
      if (!result.ok && result.code === "no_row") return json(404, { error: "No account row to update", code: "no_row" });
      const me = await meFor(key, session.email);
      return json(200, { me, limits });
    }

    const name = normalizeDisplayName(body.name);
    if (!name) {
      return json(400, {
        error: `Pick a name between ${MIN_NAME} and ${MAX_NAME} characters, without < > & or quotes.`,
        code: "bad_name",
      });
    }
    const result = await setName(key, session.email, name);
    if (!result.ok) {
      if (result.code === "name_taken") return json(409, { error: "That name is already taken — try another.", code: "name_taken" });
      return json(404, { error: "No account row to update", code: "no_row" });
    }
    const me = await meFor(key, session.email);
    return json(200, { me, limits });
  } catch (err) {
    if (err instanceof NotMigratedError) {
      console.error("leaderboard: users.lb_* columns missing — run migrations/leaderboard.sql:", err.message);
      return json(503, { error: "The leaderboard isn't set up yet.", code: "not_migrated" });
    }
    console.error("leaderboard error:", err);
    return json(500, { error: "Leaderboard unavailable" });
  }
};
