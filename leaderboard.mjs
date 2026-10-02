// leaderboard.mjs
// Leaderboard v1 (Nekh 2026-10-02): the community board panel.
//
// Two counters per learner, both computed server-side on every save
// (netlify/functions/leaderboardStats.js):
//   words — concepts mastered at level 7 across every language
//   anna  — words encountered with Anna (admitted + still being captured)
// A learner appears on the board only after choosing a display name here
// (opt-in); the counters are kept for everyone so joining shows them at
// once.
//
// This module is loaded by app.js with a dynamic import() the first time
// the start-screen button is pressed — nothing here runs or downloads at
// boot. It builds its own modal DOM on first open and reuses it after.

import { authFetch } from "./auth.mjs";

const ENDPOINT = "/.netlify/functions/leaderboard";

let modal = null;
let body = null;
let state = { data: null, tab: "words" };

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
      <button id="leaderboard-close" class="alphabet-close" type="button" aria-label="Close">✕</button>
      <h2 class="feedback-modal-title" id="leaderboard-title">Leaderboard</h2>
      <p class="feedback-modal-subtitle">Words mastered at level 7, and words you've met with Anna — across every language you study.</p>
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
  body.innerHTML = '<p class="leaderboard-loading">Loading…</p>';
}

function renderError(text) {
  body.innerHTML = `<p class="leaderboard-error">${esc(text)}</p>`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
    return '<p class="leaderboard-empty">Nobody is on the board yet — pick a name below and be the first.</p>';
  }
  const sortWords = tab === "words";
  const items = rows.map((row, i) => {
    const isMe = myName !== null && row.name === myName;
    return `<li class="leaderboard-row${isMe ? " is-me" : ""}">
      <span class="leaderboard-rank">${i + 1}</span>
      <span class="leaderboard-name">${esc(row.name)}${isMe ? ' <span class="leaderboard-you">you</span>' : ""}</span>
      <span class="leaderboard-count leaderboard-words${sortWords ? " is-sort" : ""}">${Number(row.words) || 0}</span>
      <span class="leaderboard-count leaderboard-anna${sortWords ? "" : " is-sort"}">${Number(row.anna) || 0}</span>
    </li>`;
  });
  return `<ol class="leaderboard-list">
    <li class="leaderboard-head" aria-hidden="true">
      <span></span><span></span>
      <span class="leaderboard-count${sortWords ? " is-sort" : ""}">L7</span>
      <span class="leaderboard-count${sortWords ? "" : " is-sort"}">Anna</span>
    </li>
    ${items.join("")}
  </ol>`;
}

function renderMe(data) {
  const me = data.me;
  const limits = data.limits || { minName: 2, maxName: 24 };
  if (!me) {
    return '<p class="leaderboard-note">Sign in to join the board.</p>';
  }
  const counts = `${plural(me.words, "word")} mastered · ${plural(me.anna, "word")} with Anna`;
  if (me.joined) {
    const rank = (n) => `#${Number(n) || "–"}`;
    return `
      <div class="leaderboard-me">
        <p class="leaderboard-standing">You're <strong>${rank(me.rankWords)}</strong> for words mastered and <strong>${rank(me.rankAnna)}</strong> for words with Anna, as <strong>${esc(me.name)}</strong></p>
        <p class="leaderboard-note">${counts}</p>
        <form id="leaderboard-form" class="leaderboard-form">
          <input id="leaderboard-name" class="leaderboard-input" type="text" maxlength="${limits.maxName}" autocomplete="nickname" placeholder="Change your name" aria-label="New display name" />
          <button id="leaderboard-join" class="primary leaderboard-btn" type="submit">Rename</button>
        </form>
        <button id="leaderboard-leave" class="gate-link leaderboard-leave" type="button">Leave the board</button>
        <p id="leaderboard-status" class="leaderboard-status" role="status"></p>
      </div>`;
  }
  return `
    <div class="leaderboard-me">
      <p class="leaderboard-standing">Your count: ${counts}</p>
      <p class="leaderboard-note">Join the board under a name of your choice — only the name is shown, never your email.</p>
      <form id="leaderboard-form" class="leaderboard-form">
        <input id="leaderboard-name" class="leaderboard-input" type="text" maxlength="${limits.maxName}" minlength="${limits.minName}" autocomplete="nickname" placeholder="Display name" aria-label="Display name" required />
        <button id="leaderboard-join" class="primary leaderboard-btn" type="submit">Join</button>
      </form>
      <p id="leaderboard-status" class="leaderboard-status" role="status"></p>
    </div>`;
}

function render() {
  const data = state.data;
  body.innerHTML = `
    <div class="leaderboard-tabs" role="tablist">
      <button type="button" class="leaderboard-tab" data-tab="words" role="tab" aria-selected="${state.tab === "words"}">By words mastered</button>
      <button type="button" class="leaderboard-tab" data-tab="anna" role="tab" aria-selected="${state.tab === "anna"}">By words with Anna</button>
    </div>
    ${renderList(data)}
    ${renderMe(data)}`;

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
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}

async function onSubmitName(ev) {
  ev.preventDefault();
  const input = body.querySelector("#leaderboard-name");
  const btn = body.querySelector("#leaderboard-join");
  const name = (input && input.value) || "";
  if (!name.trim()) { setStatus("Type a name first.", true); return; }
  if (btn) btn.disabled = true;
  setStatus("One moment…");
  try {
    const data = await post({ name });
    state.data.me = data.me;
    await load({ keepTab: true });
  } catch (err) {
    setStatus(err.message || "Something went wrong — please try again.", true);
    if (btn) btn.disabled = false;
  }
}

async function onLeave() {
  const btn = body.querySelector("#leaderboard-leave");
  if (btn) btn.disabled = true;
  setStatus("One moment…");
  try {
    const data = await post({ leave: true });
    state.data.me = data.me;
    await load({ keepTab: true });
  } catch (err) {
    setStatus(err.message || "Something went wrong — please try again.", true);
    if (btn) btn.disabled = false;
  }
}

async function load({ keepTab = false } = {}) {
  if (!keepTab) state.tab = "words";
  if (!state.data) renderLoading();
  try {
    const res = await authFetch(ENDPOINT);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Sign in to see the leaderboard.");
    if (!res.ok) throw new Error(data.error || `Could not load the leaderboard (${res.status})`);
    state.data = data;
    render();
  } catch (err) {
    state.data = null;
    renderError(err.message || "Could not load the leaderboard — please try again.");
  }
}

// Opens the board (building the modal on first use) and refreshes it.
export function openLeaderboard() {
  ensureModal();
  modal.classList.remove("hidden");
  return load();
}
