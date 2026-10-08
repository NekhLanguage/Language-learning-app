// leaderboard.mjs
// Leaderboard v1 (Nekh 2026-10-02): the community board panel.
//
// Two counters per learner, both computed server-side on every save
// (netlify/functions/leaderboardStats.js):
//   words — concepts mastered at level 7 across every language
//   anna  — words encountered with Anna (admitted + still being captured)
// Two periods (Nekh 2026-10-08): all time, and THIS week (what each
// learner gained since Monday 00:00 UTC; GET ?period=week, fetched only when
// the learner switches to it).
// A learner appears on the board only after choosing a display name here
// (opt-in); the counters are kept for everyone so joining shows them at
// once.
//
// This module is loaded by app.js with a dynamic import() the first time
// the start-screen button is pressed — nothing here runs or downloads at
// boot. It builds its own modal DOM on first open and reuses it after.

import { authFetch } from "./auth.mjs";
import { pluralText } from "./ui_text.mjs";

const ENDPOINT = "/.netlify/functions/leaderboard";

let modal = null;
let body = null;
let state = { data: null, tab: "words", period: "all", byPeriod: {} };

// UI text in the learner's support language (app.js passes ui_text.mjs's
// makeTranslator for it); English until then.
let t = (_key, fallback, vars) => (vars ? String(fallback).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : fallback);
let lang = "en";

const esc = (str) => String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function ensureModal() {
  if (modal) return;
  modal = document.createElement("div");
  modal.id = "leaderboard-modal";
  modal.className = "feedback-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "leaderboard-title");
  modal.innerHTML = `
    <div class="feedback-panel leaderboard-panel">
      <button id="leaderboard-close" class="alphabet-close" type="button" aria-label="${esc(t("closeLabel", "Close"))}">✕</button>
      <h2 class="feedback-modal-title" id="leaderboard-title">${esc(t("leaderboardTitle", "Leaderboard"))}</h2>
      <p class="feedback-modal-subtitle">${esc(t("leaderboardSubtitle", "Words mastered at level 7, and words you've met with Anna — across every language you study."))}</p>
      <div id="leaderboard-body" class="leaderboard-body" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(modal);
  body = modal.querySelector("#leaderboard-body");
  modal.querySelector("#leaderboard-close").addEventListener("click", close);
  modal.addEventListener("click", (ev) => { if (ev.target === modal) close(); });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !modal.classList.contains("hidden")) close();
  });
}

function close() {
  modal.classList.add("hidden");
}

function renderLoading() {
  body.innerHTML = `<p class="leaderboard-loading">${esc(t("loading", "Loading…"))}</p>`;
}

function renderError(text) {
  body.innerHTML = `<p class="leaderboard-error">${esc(text)}</p>`;
}


// Every row shows BOTH counts; the tab only decides the ordering and
// which column is lit. (v1 showed one number per row and the Anna count
// lived behind the second tab — Nekh read that as "Anna words missing".)
function renderList(data) {
  const tab = state.tab;
  const rows = (data.top && data.top[tab]) || [];
  const me = data.me;
  const myName = me && me.joined ? me.name : null;
  if (!rows.length) {
    return state.period === "week"
      ? `<p class="leaderboard-empty">${esc(t("leaderboardWeekEmpty", "Nobody has added to their count this week yet — it starts over every Monday."))}</p>`
      : `<p class="leaderboard-empty">${esc(t("leaderboardEmpty", "Nobody is on the board yet — pick a name below and be the first."))}</p>`;
  }
  const sortWords = tab === "words";
  const items = rows.map((row, i) => {
    const isMe = myName !== null && row.name === myName;
    return `<li class="leaderboard-row${isMe ? " is-me" : ""}">
      <span class="leaderboard-rank">${i + 1}</span>
      <span class="leaderboard-name">${esc(row.name)}${isMe ? ` <span class="leaderboard-you">${esc(t("leaderboardYou", "you"))}</span>` : ""}</span>
      <span class="leaderboard-count leaderboard-words${sortWords ? " is-sort" : ""}">${Number(row.words) || 0}</span>
      <span class="leaderboard-count leaderboard-anna${sortWords ? "" : " is-sort"}">${Number(row.anna) || 0}</span>
    </li>`;
  });
  return `<ol class="leaderboard-list">
    <li class="leaderboard-head" aria-hidden="true">
      <span></span><span></span>
      <span class="leaderboard-count${sortWords ? " is-sort" : ""}">${esc(t("leaderboardColWords", "L7"))}</span>
      <span class="leaderboard-count${sortWords ? "" : " is-sort"}">${esc(t("leaderboardColAnna", "Anna"))}</span>
    </li>
    ${items.join("")}
  </ol>`;
}

function renderMe(data) {
  const me = data.me;
  const limits = data.limits || { minName: 2, maxName: 24 };
  if (!me) {
    return `<p class="leaderboard-note">${esc(t("leaderboardSignInToJoin", "Sign in to join the board."))}</p>`;
  }
  const words = Number(me.words) || 0;
  const anna = Number(me.anna) || 0;
  let counts = `${esc(pluralText(t, lang, "leaderboardMastered", words, "{n} word mastered", "{n} words mastered"))} · ${esc(pluralText(t, lang, "leaderboardWithAnna", anna, "{n} word with Anna", "{n} words with Anna"))}`;
  if (state.period === "week") counts = esc(t("leaderboardThisWeek", "This week: {counts}", { counts }));
  if (me.joined) {
    const rank = (n) => `#${Number(n) || "–"}`;
    return `
      <div class="leaderboard-me">
        <p class="leaderboard-standing">${t("leaderboardStanding", "You're {rankWords} for words mastered and {rankAnna} for words with Anna, as {name}", {
          rankWords: `<strong>${rank(me.rankWords)}</strong>`,
          rankAnna: `<strong>${rank(me.rankAnna)}</strong>`,
          name: `<strong>${esc(me.name)}</strong>`,
        })}</p>
        <p class="leaderboard-note">${counts}</p>
        <form id="leaderboard-form" class="leaderboard-form">
          <input id="leaderboard-name" class="leaderboard-input" type="text" maxlength="${limits.maxName}" autocomplete="nickname" placeholder="${esc(t("leaderboardRenamePlaceholder", "Change your name"))}" aria-label="${esc(t("leaderboardRenameLabel", "New display name"))}" />
          <button id="leaderboard-join" class="primary leaderboard-btn" type="submit">${esc(t("leaderboardRename", "Rename"))}</button>
        </form>
        <button id="leaderboard-leave" class="gate-link leaderboard-leave" type="button">${esc(t("leaderboardLeave", "Leave the board"))}</button>
        <p id="leaderboard-status" class="leaderboard-status" role="status"></p>
      </div>`;
  }
  return `
    <div class="leaderboard-me">
      <p class="leaderboard-standing">${t("leaderboardYourCount", "Your count: {counts}", { counts })}</p>
      <p class="leaderboard-note">${esc(t("leaderboardJoinNote", "Join the board under a name of your choice — only the name is shown, never your email."))}</p>
      <form id="leaderboard-form" class="leaderboard-form">
        <input id="leaderboard-name" class="leaderboard-input" type="text" maxlength="${limits.maxName}" minlength="${limits.minName}" autocomplete="nickname" placeholder="${esc(t("leaderboardNameLabel", "Display name"))}" aria-label="${esc(t("leaderboardNameLabel", "Display name"))}" required />
        <button id="leaderboard-join" class="primary leaderboard-btn" type="submit">${esc(t("leaderboardJoin", "Join"))}</button>
      </form>
      <p id="leaderboard-status" class="leaderboard-status" role="status"></p>
    </div>`;
}

function render() {
  const data = state.data;
  const period = state.period;
  body.innerHTML = `
    <div class="leaderboard-periods" role="group" aria-label="${esc(t("leaderboardPeriodLabel", "Period"))}">
      <button type="button" class="leaderboard-period" data-period="all" aria-pressed="${period === "all"}">${esc(t("leaderboardPeriodAll", "All time"))}</button>
      <button type="button" class="leaderboard-period" data-period="week" aria-pressed="${period === "week"}">${esc(t("leaderboardPeriodWeek", "This week"))}</button>
    </div>
    ${period === "week" ? `<p class="leaderboard-note leaderboard-week-note">${esc(t("leaderboardWeekNote", "Words added since Monday. The week starts over every Monday."))}</p>` : ""}
    <div class="leaderboard-tabs" role="tablist">
      <button type="button" class="leaderboard-tab" data-tab="words" role="tab" aria-selected="${state.tab === "words"}">${esc(t("leaderboardTabWords", "By words mastered"))}</button>
      <button type="button" class="leaderboard-tab" data-tab="anna" role="tab" aria-selected="${state.tab === "anna"}">${esc(t("leaderboardTabAnna", "By words with Anna"))}</button>
    </div>
    ${renderList(data)}
    ${renderMe(data)}`;

  body.querySelectorAll(".leaderboard-period").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.period === "week" ? "week" : "all";
      if (next === state.period) return;
      state.period = next;
      if (state.byPeriod[next]) {
        state.data = state.byPeriod[next];
        render();
      } else {
        load({ keepTab: true });
      }
    });
  });

  body.querySelectorAll(".leaderboard-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab === "anna" ? "anna" : "words";
      render();
    });
  });

  const form = body.querySelector("#leaderboard-form");
  if (form) form.addEventListener("submit", onSubmitName);
  const leave = body.querySelector("#leaderboard-leave");
  if (leave) leave.addEventListener("click", onLeave);
}

function setStatus(text, isError) {
  const el = body.querySelector("#leaderboard-status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", !!isError);
}

async function post(payload) {
  const res = await authFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("errorWithStatus", "Something went wrong ({status})", { status: res.status }));
  return data;
}

async function onSubmitName(ev) {
  ev.preventDefault();
  const input = body.querySelector("#leaderboard-name");
  const btn = body.querySelector("#leaderboard-join");
  const name = (input && input.value) || "";
  if (!name.trim()) { setStatus(t("leaderboardNameFirst", "Type a name first."), true); return; }
  if (btn) btn.disabled = true;
  setStatus(t("oneMoment", "One moment…"));
  try {
    await post({ name });
    state.byPeriod = {}; // the caller moved on both boards
    await load({ keepTab: true });
  } catch (err) {
    setStatus(err.message || t("authGeneric", "Something went wrong — please try again."), true);
    if (btn) btn.disabled = false;
  }
}

async function onLeave() {
  const btn = body.querySelector("#leaderboard-leave");
  if (btn) btn.disabled = true;
  setStatus(t("oneMoment", "One moment…"));
  try {
    await post({ leave: true });
    state.byPeriod = {};
    await load({ keepTab: true });
  } catch (err) {
    setStatus(err.message || t("authGeneric", "Something went wrong — please try again."), true);
    if (btn) btn.disabled = false;
  }
}

async function load({ keepTab = false } = {}) {
  if (!keepTab) {
    state.tab = "words";
    state.period = "all";
  }
  const period = state.period;
  if (!state.data || state.data.period !== period) renderLoading();
  try {
    const res = await authFetch(period === "week" ? `${ENDPOINT}?period=week` : ENDPOINT);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error(t("leaderboardSignInToSee", "Sign in to see the leaderboard."));
    if (!res.ok) throw new Error(data.error || t("leaderboardLoadFailedStatus", "Could not load the leaderboard ({status})", { status: res.status }));
    data.period = period;
    state.byPeriod[period] = data;
    state.data = data;
    render();
  } catch (err) {
    state.data = null;
    renderError(err.message || t("leaderboardLoadFailed", "Could not load the leaderboard — please try again."));
  }
}

// Opens the board (building the modal on first use) and refreshes it.
// `opts.t` / `opts.lang`: the learner's support-language translator. The
// modal is rebuilt when the language changed since it was last built.
export function openLeaderboard(opts = {}) {
  if (typeof opts.t === "function") t = opts.t;
  if (opts.lang && opts.lang !== lang) {
    lang = opts.lang;
    modal?.remove();
    modal = null;
  }
  ensureModal();
  modal.classList.remove("hidden");
  state.byPeriod = {};
  return load();
}
