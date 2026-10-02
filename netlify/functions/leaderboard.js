// Leaderboard v1 (Nekh 2026-10-02): the community board.
//
//   GET  -> { top: { words: [...], anna: [...] }, me, limits }
//        top.* are the TOP_N learners who joined, by words mastered at
//        level 7 and by words encountered with Anna; each row is
//        { name, words, anna }. `me` is the caller's own row when the
//        request carries a session ({ joined, name, words, anna,
//        rankWords, rankAnna }), null otherwise — the list itself is
//        public to anyone signed in, the name is the only thing shown.
//   POST { name }       -> join the board (or rename) under that name.
//   POST { leave: true } -> leave the board (counters keep updating, the
//        row just isn't shown).
//
// The counters themselves are written by saveUser on every save
// (leaderboardStats.js), so this function only ever reads them. Nothing
// here runs at boot: the app fetches it when the learner opens the board.

const { SUPABASE_URL, usersKey, restHeaders, missingKeyResponse } = require("./supabase");
const { verifySession, unauthorizedResponse } = require("./auth");
const { normalizeDisplayName, MIN_NAME, MAX_NAME } = require("./leaderboardStats");

const TOP_N = 25;
const ROW_SELECT = "lb_name,lb_words,lb_anna";

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
  return /lb_(name|words|anna|updated_at)/.test(String(text || ""));
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
async function countAhead(key, column, value) {
  const res = await rest(
    key,
    `?select=email&lb_name=not.is.null&${column}=gt.${encodeURIComponent(value)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } }
  );
  if (!res.ok) throw new Error(`leaderboard count returned ${res.status}`);
  const range = res.headers.get("content-range") || "";
  const m = /\/(\d+)\s*$/.exec(range);
  return m ? Number(m[1]) : 0;
}

async function meFor(key, email) {
  const res = await rest(key, `?select=${ROW_SELECT}&email=eq.${encodeURIComponent(email)}`);
  if (!res.ok) {
    const text = await res.text();
    if (notMigrated(text)) throw new NotMigratedError(text);
    throw new Error(`leaderboard me read returned ${res.status}: ${text}`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return null;
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
      const [words, anna, me] = await Promise.all([
        topBy(key, "lb_words"),
        topBy(key, "lb_anna"),
        meFor(key, session.email),
      ]);
      return json(200, { top: { words, anna }, me, limits });
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
