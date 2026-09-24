// tutor.js — the AI Tutor test page (tutor.html).
// Reads the learner's real app state, builds the mastery profile, and drives
// a chat with the tutor serverless function.
//
// Where Anna's state lives (schema v4):
//   USER.tutor.prefs[lang]    — coaching dials + the learner's own instructions
//   USER.tutor.memory[lang]   — bounded end-of-session records
//   USER.runs[lang].personalVocab / pendingAdmission — tutor vocabulary
//   USER.learnerFacts         — cross-language identity facts
//   USER.tutor.topics         — conversation topics (beta, schema v5;
//                               see tutor_topics.mjs)
// All of it rides the same localStorage + Supabase persist path as app.js, so
// a deploy, a cleared cache or a new device never loses Anna's instructions.
// Device-local keys are kept only as (a) a one-time migration source for
// state written before v4 and (b) crash-safety copies of in-flight text:
// the unsent draft and the live transcript of the current conversation.

import { recoverUser, USER_KEY, USER_BACKUP_KEY } from "./storage.mjs";
import { getSession as getAuthSession, authFetch } from "./auth.mjs";
import { AVAILABLE_LANGUAGES } from "./languages.js";
import { buildProfileText, buildMemoryText, pickTutorRun, mergePersonalVocab, wordCountLabel } from "./tutor_profile.mjs";
import { processTutorSession, applyAdmissions } from "./tutor_admission.mjs";
import {
  getLearnerFacts,
  renderLearnerFactsText,
  applyTutorLearnerFacts,
  removeLearnerFact,
} from "./learner_facts.mjs";
import {
  orderedTopics,
  findTopic,
  createTopic,
  removeTopic,
  renderTopicsText,
  applyTopicSummary,
  queueTopicProposals,
  getTopicProposals,
  acceptTopicProposal,
  dismissTopicProposal,
} from "./tutor_topics.mjs";

const VOCAB_FILES = [
  "adjectives.json", "connectors.json", "directions_positions.json",
  "glue_words.json", "nouns.json", "numbers.json",
  "politeness_modality.json", "pronouns.json", "quantifiers.json",
  "question_words.json", "time_words.json", "verbs.json", "pokemon.json",
  "harry_potter.json", "cooking.json", "anime.json", "football.json",
  "music.json", "everyday_life.json", "fashion_style.json", "gaming.json",
  "tourism.json", "space_scifi.json", "fitness.json",
];

const MAX_STORED_SESSIONS = 10;
const MAX_PERSONAL_VOCAB = 200;
// Free-text instructions for Anna. The server caps at the same length.
const MAX_NOTE_CHARS = 1000;
// Tutor calls: every request gets this many attempts before the learner
// sees a failure, with 1 s / 2 s pauses in between. Timeouts are per
// attempt and sit above the slowest reply seen so far so a slow-but-fine
// answer is never abandoned.
const TUTOR_ATTEMPTS = 3;
const TUTOR_TIMEOUT_MS = { chat: 45_000, summary: 60_000 };
const TUTOR_BACKOFF_MS = [1_000, 2_000];
// A session whose end-of-session record could not be written is kept
// locally and retried on later visits, at most this many times.
const MAX_PENDING_SUMMARY_ATTEMPTS = 5;
const DEFAULT_PREFS = { correctionDepth: "medium", challenge: "stretch", languageMix: "balanced", note: "" };

const els = {
  gate: document.getElementById("tutor-gate"),
  main: document.getElementById("tutor-main"),
  langLabel: document.getElementById("tutor-lang-label"),
  chat: document.getElementById("tutor-chat"),
  input: document.getElementById("tutor-input"),
  send: document.getElementById("tutor-send"),
  end: document.getElementById("tutor-end"),
  prefCorrection: document.getElementById("pref-correction"),
  prefChallenge: document.getElementById("pref-challenge"),
  prefLanguageMix: document.getElementById("pref-languagemix"),
  note: document.getElementById("tutor-note"),
  noteCount: document.getElementById("tutor-note-count"),
  settings: document.getElementById("tutor-settings"),
  settingsBtn: document.getElementById("tutor-settings-btn"),
  settingsTitle: document.getElementById("tutor-settings-title"),
  intro: document.getElementById("tutor-intro"),
  settingsSave: document.getElementById("tutor-settings-save"),
  settingsClose: document.getElementById("tutor-settings-close"),
  settingsHint: document.getElementById("tutor-settings-hint"),
  memory: document.getElementById("tutor-memory"),
  memoryBtn: document.getElementById("tutor-memory-btn"),
  memoryClose: document.getElementById("tutor-memory-close"),
  memoryList: document.getElementById("tutor-memory-list"),
};

const state = {
  email: "",
  targetLang: "",
  supportLang: "",
  targetLabel: "",
  supportLabel: "",
  user: null,       // the full migrated USER blob (run below points into it)
  run: null,
  forms: {},        // lang -> cid -> entry
  messages: [],     // [{role, content}]
  busy: false,
  // The learner's last message when Anna could not be reached: stays in the
  // input and in `messages` until it is delivered, so nothing is retyped.
  pending: null,    // { msg, bubble } | null
  // Vocabulary write-back cohort flag. Plumbing only for now — resolved at
  // session start, gates nothing until the admission logic ships.
  vocabWriteback: false,
  // Beta features this learner is in (server BETA_EMAILS, via ping).
  beta: { topics: false },
  // The conversation topic picked for the current conversation (beta).
  topicId: null,
  topicPicker: null, // the picker element while it is on screen
};

// --- Device-local keys ------------------------------------------------------

function legacyStoreKey() { return `zth_tutor_${state.targetLang}`; }
function legacyPrefsKey() { return `zth_tutor_prefs_${state.targetLang}`; }
function draftKey() { return `zth_tutor_draft_${state.targetLang}`; }
function liveKey() { return `zth_tutor_live_${state.targetLang}`; }

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("tutor: localStorage write failed:", key, err);
  }
}

// Pre-v4 device-local session store (sessions + legacy personal vocab).
function loadLegacyStore() {
  const parsed = readJson(legacyStoreKey(), {});
  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    personalVocab: Array.isArray(parsed.personalVocab) ? parsed.personalVocab : [],
  };
}

// --- Synced tutor state (USER.tutor, schema v4) -----------------------------

function tutorRoot() {
  const u = state.user;
  if (!u.tutor || typeof u.tutor !== "object") u.tutor = {};
  if (!u.tutor.prefs || typeof u.tutor.prefs !== "object") u.tutor.prefs = {};
  if (!u.tutor.memory || typeof u.tutor.memory !== "object") u.tutor.memory = {};
  return u.tutor;
}

function tutorMemory() {
  const root = tutorRoot();
  let m = root.memory[state.targetLang];
  if (!m || typeof m !== "object") m = root.memory[state.targetLang] = { sessions: [] };
  if (!Array.isArray(m.sessions)) m.sessions = [];
  return m;
}

function normalizePrefs(p) {
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
  return {
    correctionDepth: pick(p?.correctionDepth, ["light", "medium", "deep"], DEFAULT_PREFS.correctionDepth),
    challenge: pick(p?.challenge, ["comfort", "stretch", "push"], DEFAULT_PREFS.challenge),
    languageMix: pick(p?.languageMix, ["immersion", "balanced", "support"], DEFAULT_PREFS.languageMix),
    note: String(p?.note || "").trim().slice(0, MAX_NOTE_CHARS),
    updatedAt: typeof p?.updatedAt === "string" ? p.updatedAt : new Date().toISOString().slice(0, 10),
  };
}

function savedPrefs() {
  const p = tutorRoot().prefs[state.targetLang];
  return p && typeof p === "object" ? p : null;
}

// One-time adoption of pre-v4 device-local state into the synced record.
// Runs every start (cheap, idempotent): only fills what the record lacks,
// and never deletes the legacy copies, so a rollback loses nothing.
function adoptLegacyTutorState() {
  let changed = false;
  const root = tutorRoot();
  if (!savedPrefs()) {
    const legacy = readJson(legacyPrefsKey(), null);
    if (legacy && typeof legacy === "object") {
      root.prefs[state.targetLang] = normalizePrefs(legacy);
      changed = true;
    }
  }
  const mem = tutorMemory();
  if (!mem.sessions.length) {
    const legacy = loadLegacyStore();
    if (legacy.sessions.length) {
      mem.sessions = legacy.sessions.slice(0, MAX_STORED_SESSIONS);
      changed = true;
    }
  }
  return changed;
}

// The run's canonical personal-vocab list (schema v2 seeds it, but stay
// null-safe against blobs the migration hasn't touched yet).
function runPersonalVocab() {
  if (!Array.isArray(state.run.personalVocab)) state.run.personalVocab = [];
  return state.run.personalVocab;
}

// Same persist-then-sync shape as app.js's saveUser(): localStorage first
// (source of truth for this device), then best-effort Supabase mirror. The
// app re-runs its own server merge at next boot, so no read-back here.
//
// Merge-on-write: an app tab open alongside the tutor may have saved newer
// state since this page loaded, so re-read the stored blob and graft only
// the tutor-owned fields onto it instead of overwriting wholesale. (The
// reverse race — an app tab saving its stale in-memory blob AFTER this
// write — can't be fixed from this side.)
async function persistUser() {
  let user = state.user;
  if (!user || !user.runs) return;
  // Snapshot tutor-owned user-level fields BEFORE the merge-on-write swap
  // below reassigns state.user to the freshly-loaded blob — otherwise the
  // graft would copy stored values back onto themselves and this session's
  // writes would be lost.
  const tutorLearnerFacts = Array.isArray(user.learnerFacts) ? user.learnerFacts : null;
  const tutorState = user.tutor && typeof user.tutor === "object" ? user.tutor : null;
  const { user: stored } = recoverUser(localStorage.getItem(USER_KEY), null);
  if (stored && stored.runs) {
    const target = stored.runs[state.targetLang];
    if (target && typeof target === "object") {
      target.personalVocab = state.run.personalVocab || [];
      target.pendingAdmission = state.run.pendingAdmission || [];
      if (state.run.tutorVocab) target.tutorVocab = state.run.tutorVocab;
      // Tutor-admitted concepts are tutor-owned writes too: merge them into
      // the stored run's ladder rather than losing them to the graft.
      for (const cid of state.run.released || []) {
        if (!cid.startsWith("TUTOR_")) continue;
        if (!Array.isArray(target.released)) target.released = [];
        if (!target.released.includes(cid)) target.released.push(cid);
        if (state.run.progress?.[cid]) {
          if (!target.progress || typeof target.progress !== "object") target.progress = {};
          if (!target.progress[cid]) target.progress[cid] = state.run.progress[cid];
        }
      }
      user = stored;
      state.user = stored;
      // Keep state.run pointing into the blob we now persist, preserving
      // the tutor-owned lists just grafted.
      state.run = target;
    }
    // learnerFacts and tutor (prefs + memory) are user-level tutor-owned
    // fields. Graft the snapshots onto the freshly-loaded stored blob so an
    // app tab that saved after the tutor page loaded doesn't roll back this
    // session's writes. The app never writes either field.
    if (tutorLearnerFacts) stored.learnerFacts = tutorLearnerFacts;
    if (tutorState) stored.tutor = tutorState;
  }
  user.lastLocalChange = Date.now();
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const email = state.email.toLowerCase();
  if (!email) return;
  try {
    // The session token names the row; the server ignores a body email.
    await authFetch("/.netlify/functions/saveUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user }),
    });
    user.lastSyncedAt = Date.now();
  } catch (err) {
    console.warn("tutor: user sync failed:", err);
  }
}

// Resolves whether this learner is in the vocabulary write-back cohort.
// Server-side allowlist (TUTOR_VOCAB_WRITEBACK_EMAILS, same pattern as
// tutor access itself) so Nekh can add beta users without a deploy; the
// localStorage override exists for local iteration only.
// The same ping also returns the beta features this learner is in
// (BETA_EMAILS); the server re-checks them on every request.
async function resolveFlags() {
  const override = localStorage.getItem("zth_tutor_writeback_override");
  let data = {};
  try {
    const res = await authFetch("/.netlify/functions/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ping" }),
    });
    if (res.ok) data = await res.json();
  } catch {
    // offline or unreachable: no write-back, no beta
  }
  const vocabWriteback = override === "on" ? true : override === "off" ? false : data.vocabWriteback === true;
  return { vocabWriteback, beta: { topics: data.beta?.topics === true } };
}

// --- Preferences ------------------------------------------------------------

// What the settings panel currently shows. Falls back to the saved record
// (or defaults) when the panel elements are missing, so requests never go
// out without dials.
function currentPreferences() {
  return normalizePrefs({
    correctionDepth: els.prefCorrection.value,
    challenge: els.prefChallenge.value,
    languageMix: els.prefLanguageMix.value,
    note: els.note.value,
    updatedAt: savedPrefs()?.updatedAt,
  });
}

// The preferences sent to Anna: always the SAVED record, never half-edited
// panel state — an open settings panel must not leak unsaved dials into a
// request.
function effectivePreferences() {
  const saved = savedPrefs();
  return saved ? normalizePrefs(saved) : normalizePrefs(DEFAULT_PREFS);
}

function fillPanel(p) {
  els.prefCorrection.value = p.correctionDepth;
  els.prefChallenge.value = p.challenge;
  els.prefLanguageMix.value = p.languageMix;
  els.note.value = p.note || "";
  updateNoteCount();
}

function restorePreferences() {
  fillPanel(effectivePreferences());
}

function updateNoteCount() {
  if (!els.noteCount) return;
  els.noteCount.textContent = `${els.note.value.length}/${MAX_NOTE_CHARS}`;
}

// Saves the panel into the synced record (plus the legacy device key as a
// rollback mirror) and syncs it.
function persistPreferences() {
  const prefs = { ...currentPreferences(), updatedAt: new Date().toISOString().slice(0, 10) };
  tutorRoot().prefs[state.targetLang] = prefs;
  writeJson(legacyPrefsKey(), prefs);
  return persistUser();
}

function hasSavedPrefs() {
  return savedPrefs() !== null;
}

const TUTOR_INTRO_EN = "Anna is your personal tutor. She uses the vocabulary you've shown you know, and what she knows you've practiced in the app, to guide the lessons. What you practice in your conversations with Anna is also added to the app, for an even more personal experience.";

// One panel, two modes: "setup" (first visit, blocking, no close) and
// "settings" (later edits via the ⚙️ button, closable without saving).
function openSettings(mode) {
  els.settingsTitle.textContent = mode === "setup" ? "Set up Anna" : "Settings";
  // First visit only: who Anna is and what she does with your progress,
  // in the support language (lang/<code>.json uiStrings.tutorIntro;
  // Nekh 2026-09-16).
  els.intro.textContent = (state.uiStrings && state.uiStrings.tutorIntro) || TUTOR_INTRO_EN;
  els.intro.hidden = mode !== "setup";
  els.settingsSave.textContent = mode === "setup" ? "Start talking" : "Save";
  els.settingsClose.hidden = mode === "setup";
  els.settingsHint.hidden = mode !== "setup";
  els.settings.dataset.mode = mode;
  els.settings.hidden = false;
}

function saveSettings() {
  const mode = els.settings.dataset.mode;
  persistPreferences();
  els.settings.hidden = true;
  if (mode === "setup") {
    addMessage("status", "Saved — change these anytime with the ⚙️ button.");
    addMessage("status", `Say hi to start — try greeting Anna in ${state.targetLabel}.`);
  } else {
    addMessage("status", state.messages.length
      ? "Settings saved — Anna follows them from her next reply."
      : "Settings saved.");
  }
  els.input.focus();
}

// --- Memory panel -----------------------------------------------------------

// Renders the current learner-facts list into the memory panel. Each row is
// the fact text + a ✕ that splices the entry and persists. Reads state.user
// live every render so the panel reflects whatever the last End-session
// admission wrote, not a stale snapshot from when the panel opened.
function renderMemory() {
  const facts = getLearnerFacts(state.user);
  els.memoryList.innerHTML = "";
  if (!facts.length) {
    const empty = document.createElement("p");
    empty.className = "tutor-memory-empty";
    empty.textContent = "Nothing yet. Anna will start remembering identity and subject facts as you talk — you can come back here to remove any that miss the mark.";
    els.memoryList.appendChild(empty);
    return;
  }
  facts.forEach((fact, idx) => {
    const li = document.createElement("li");
    li.className = "tutor-memory-item";
    const span = document.createElement("span");
    span.className = "tutor-memory-text";
    span.textContent = fact?.text || "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutor-memory-remove";
    btn.textContent = "✕";
    btn.setAttribute("aria-label", `Remove: ${fact?.text || ""}`);
    btn.addEventListener("click", () => {
      // Splice by INDEX (not text) so two facts with identical text — the
      // store dedupes case-insensitively on add but not on correction — can
      // still be removed unambiguously.
      const { removed } = removeLearnerFact(state.user, idx);
      if (!removed) return;
      renderMemory();
      // Persist through the tutor's own merge-on-write path so a concurrent
      // app tab's newer state isn't clobbered.
      persistUser();
    });
    li.appendChild(span);
    li.appendChild(btn);
    els.memoryList.appendChild(li);
  });
}

function openMemory() {
  renderMemory();
  els.memory.hidden = false;
}

function closeMemory() {
  els.memory.hidden = true;
}

// --- Chat UI ----------------------------------------------------------------

function showGate(html) {
  els.gate.hidden = false;
  els.gate.innerHTML = html;
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `tutor-msg ${role}`;
  div.dir = "auto";
  div.textContent = text;
  // The topic picker (beta) stays the last thing in the chat while it is
  // open; status lines that land meanwhile go above it.
  if (state.topicPicker?.isConnected) els.chat.insertBefore(div, state.topicPicker);
  else els.chat.appendChild(div);
  els.chat.scrollTop = els.chat.scrollHeight;
  return div;
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  els.end.disabled = busy;
  els.input.disabled = busy;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Crash-safety copies of in-flight text. The draft is whatever sits in the
// input; the live transcript is the current conversation. Both are
// device-local (they are only meaningful on the device that typed them)
// and both are cleared once the text has reached its destination.
function saveDraft() {
  const text = els.input.value;
  writeJson(draftKey(), text ? { text, at: Date.now() } : null);
}

function clearDraft() {
  writeJson(draftKey(), null);
}

function saveLiveTranscript() {
  writeJson(liveKey(), state.messages.length ? { at: Date.now(), messages: state.messages, topicId: state.topicId } : null);
}

function clearLiveTranscript() {
  writeJson(liveKey(), null);
}

// Marks a user bubble as undelivered and gives it a Retry control. The
// message stays in `messages` and its text stays in the input, so Retry
// (or Send) re-sends it without any retyping.
function markUndelivered(bubble, reason) {
  bubble.classList.add("undelivered");
  let bar = bubble.querySelector(".tutor-msg-failed");
  if (!bar) {
    bar = document.createElement("span");
    bar.className = "tutor-msg-failed";
    const label = document.createElement("span");
    label.className = "tutor-msg-failed-label";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "tutor-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      if (state.pending && !els.input.value.trim()) els.input.value = state.pending.msg.content;
      sendMessage();
    });
    bar.append(label, retry);
    bubble.appendChild(bar);
  }
  bar.querySelector(".tutor-msg-failed-label").textContent = `Not delivered — ${reason}. Your message is kept.`;
}

function markDelivered(bubble) {
  bubble.classList.remove("undelivered");
  bubble.querySelector(".tutor-msg-failed")?.remove();
}

// Re-renders a restored conversation.
function renderTranscript(messages) {
  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant") addMessage(m.role, m.content);
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

// Loads the forms maps for target + support: core lang files plus the
// pack-specific languages sections, mirroring how app.js builds GLOBAL_VOCAB.
async function loadForms() {
  const langs = [...new Set([state.targetLang, state.supportLang])];
  for (const code of langs) state.forms[code] = {};

  const langResults = await Promise.all(
    langs.map((code) => fetchJson(`lang/${code}.json`).catch(() => ({ forms: {} })))
  );
  langs.forEach((code, i) => Object.assign(state.forms[code], langResults[i].forms || {}));
  // UI strings in the learner's support language (the first-visit intro).
  state.uiStrings = langResults[langs.indexOf(state.supportLang)]?.uiStrings || {};

  const packResults = await Promise.all(
    VOCAB_FILES.map((f) => fetchJson(f).catch(() => ({})))
  );
  for (const data of packResults) {
    for (const code of langs) {
      const packForms = data.languages?.[code]?.forms;
      if (packForms) {
        // Lang-file forms are the curated source of truth; packs fill gaps.
        for (const [cid, entry] of Object.entries(packForms)) {
          if (!(cid in state.forms[code])) state.forms[code][cid] = entry;
        }
      }
    }
  }
}

// --- Tutor requests ---------------------------------------------------------

function buildRequestBody(mode, messages = state.messages, { topicId = state.topicId } = {}) {
  const body = {
    mode,
    email: state.email,
    targetLang: state.targetLabel,
    supportLang: state.supportLabel,
    profile: buildProfileText({
      run: state.run,
      targetForms: state.forms[state.targetLang],
      supportForms: state.forms[state.supportLang],
      targetLabel: state.targetLabel,
      supportLabel: state.supportLabel,
      // Pending-admission words are still tutor-held vocabulary — keep them
      // visible to the model so it recycles them (which is exactly what
      // earns their next sighting).
      personalVocab: [...runPersonalVocab(), ...(state.run.pendingAdmission || [])],
    }),
    preferences: effectivePreferences(),
    memory: buildMemoryText(tutorMemory()),
    // Bounded (20-entry hard cap on the client), user-level, cross-language.
    // The function renders them at the top of the system prompt above the
    // vocab profile — see learner_facts.mjs and netlify/functions/tutor.js.
    learnerFacts: renderLearnerFactsText(getLearnerFacts(state.user)),
    messages,
  };
  // Beta: the learner's conversation topics and the one this conversation
  // is about. The server ignores the field for non-beta accounts.
  if (state.beta.topics) body.topics = renderTopicsText(state.user, topicId, tutorMemory().sessions);
  return body;
}

// Calls the tutor function with retries. Network errors, timeouts and
// server-side failures (5xx, 429) are retried with a short backoff; a
// definite rejection (bad request, no access, missing API key) is not.
// Callers never see a transient failure unless every attempt failed.
async function callTutor(mode, messages, opts) {
  const body = JSON.stringify(buildRequestBody(mode, messages, opts));
  let lastErr = null;
  for (let attempt = 0; attempt < TUTOR_ATTEMPTS; attempt++) {
    if (attempt) await sleep(TUTOR_BACKOFF_MS[attempt - 1] ?? TUTOR_BACKOFF_MS.at(-1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TUTOR_TIMEOUT_MS[mode] || TUTOR_TIMEOUT_MS.chat);
    try {
      const res = await authFetch("/.netlify/functions/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      const payload = await res.json().catch(() => ({}));
      const missingKey = res.status === 503 && /api key/i.test(payload.error || "");
      const err = new Error(
        missingKey
          ? "Anna isn't fully set up on the server yet — missing API key"
          : payload.error || `Tutor request failed (${res.status})`
      );
      err.retryable = !missingKey && (res.status === 408 || res.status === 429 || res.status >= 500);
      if (!err.retryable) throw err;
      lastErr = err;
    } catch (err) {
      if (err.retryable === false) throw err;
      lastErr = err.name === "AbortError" ? new Error("no answer in time") : err;
    } finally {
      clearTimeout(timer);
    }
    console.warn(`tutor ${mode} attempt ${attempt + 1}/${TUTOR_ATTEMPTS} failed:`, lastErr?.message);
  }
  throw lastErr || new Error("Tutor request failed");
}

// --- Streamed replies ------------------------------------------------------
// Anna's reply arrives as newline-delimited JSON from
// /.netlify/functions/tutorStream ({t:"…"} pieces, then {done:true}); see
// that file for the format. onText is called with each piece as it lands.
// Throws with `err.fallback = true` when nothing at all was received (the
// endpoint is missing, refused the request, or died before the first
// piece) — the caller then uses the classic one-shot call, so a streaming
// outage never costs the learner a reply.
const STREAM_IDLE_MS = 45_000;

async function streamTutor(onText) {
  const body = JSON.stringify(buildRequestBody("chat"));
  const ctrl = new AbortController();
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), STREAM_IDLE_MS);
  };
  const fallback = (message) => {
    const err = new Error(message);
    err.fallback = true;
    return err;
  };
  arm();
  let reply = "";
  try {
    let res;
    try {
      res = await authFetch("/.netlify/functions/tutorStream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
      });
    } catch (err) {
      throw fallback(err.name === "AbortError" ? "no answer in time" : err.message);
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      // A definite refusal (no access, bad input) is the same answer the
      // classic call would give; don't ask it again.
      const err = new Error(payload.error || `Tutor request failed (${res.status})`);
      err.fallback = res.status === 404 || res.status === 405 || res.status === 408 || res.status === 429 || res.status >= 500;
      throw err;
    }
    if (!res.body || !res.body.getReader) throw fallback("streaming not supported");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    let refused = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      arm();
      buffer += decoder.decode(chunk.value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.error) throw reply ? new Error(evt.error) : fallback(evt.error);
        if (typeof evt.t === "string" && evt.t) {
          reply += evt.t;
          onText(evt.t, reply);
        }
        if (evt.done) { done = true; refused = !!evt.refused; break; }
      }
    }
    if (!done) throw reply ? new Error("the reply was cut off") : fallback("no answer came back");
    return { reply: refused ? "" : reply, refused };
  } finally {
    clearTimeout(timer);
  }
}

function addTypingIndicator() {
  const div = addMessage("status", "");
  div.classList.add("typing");
  div.setAttribute("aria-label", "Anna is typing");
  for (let i = 0; i < 3; i++) div.appendChild(document.createElement("span"));
  return div;
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  // Typing without picking a topic is a free conversation.
  closeTopicPicker();

  let bubble;
  if (state.pending) {
    // Re-send (possibly edited) the message Anna never received.
    state.pending.msg.content = text;
    bubble = state.pending.bubble;
    markDelivered(bubble);
    bubble.textContent = text;
  } else {
    state.messages.push({ role: "user", content: text });
    bubble = addMessage("user", text);
    state.pending = { msg: state.messages[state.messages.length - 1], bubble };
  }
  saveLiveTranscript();
  // The input keeps the text until Anna has it; a failure costs no retyping.

  let thinking = addTypingIndicator();
  let live = null; // the assistant bubble while the reply is streaming in
  setBusy(true);
  try {
    let data;
    try {
      data = await streamTutor((piece, soFar) => {
        if (!live) {
          thinking.remove();
          live = addMessage("assistant", "");
          live.classList.add("streaming");
        }
        live.textContent = soFar;
        els.chat.scrollTop = els.chat.scrollHeight;
      });
    } catch (err) {
      if (!err.fallback) throw err;
      // Nothing arrived from the streaming endpoint: one-shot call instead.
      console.warn("tutor stream unavailable, falling back:", err.message);
      if (!thinking.isConnected) thinking = addTypingIndicator();
      data = await callTutor("chat");
    }
    thinking.remove();
    state.pending = null;
    els.input.value = "";
    clearDraft();
    if (data.refused || !data.reply) {
      if (live) live.remove();
      addMessage("status", "The tutor couldn't answer that one — try rephrasing.");
      return;
    }
    state.messages.push({ role: "assistant", content: data.reply });
    saveLiveTranscript();
    if (live) {
      live.textContent = data.reply;
      live.classList.remove("streaming");
    } else {
      addMessage("assistant", data.reply);
    }
  } catch (err) {
    console.warn("tutor chat failed:", err);
    thinking.remove();
    if (live) live.remove();
    markUndelivered(bubble, err.message);
  } finally {
    setBusy(false);
    els.input.focus();
  }
}

// --- End of session ---------------------------------------------------------

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function pushSessionRecord(record) {
  const mem = tutorMemory();
  mem.sessions.unshift(record);
  mem.sessions = mem.sessions.slice(0, MAX_STORED_SESSIONS);
  // Legacy device-local mirror (rollback safety; never read once v4 has
  // adopted it).
  const legacy = loadLegacyStore();
  legacy.sessions = mem.sessions.map(({ pending, ...rest }) => rest);
  writeJson(legacyStoreKey(), legacy);
}

function sessionRecordFromSummary(summary, when) {
  return {
    when,
    sessionSummary: summary.sessionSummary || "",
    struggles: Array.isArray(summary.struggles) ? summary.struggles : [],
    nextFocus: summary.nextFocus || "",
  };
}

// When Anna's own notes could not be written, the session is still saved:
// a short local digest keeps continuity for the next visit, and the
// transcript rides along so the real record can be written later.
function fallbackSessionRecord(messages, when) {
  const userTurns = messages.filter((m) => m.role === "user").length;
  const tail = messages
    .slice(-4)
    .map((m) => `${m.role === "user" ? "learner" : "Anna"}: ${String(m.content).slice(0, 120)}`)
    .join(" / ");
  return {
    when,
    sessionSummary: `(Anna's notes for this session are still being written.) ${userTurns} learner messages. Ended with: ${tail}`.slice(0, 700),
    struggles: [],
    nextFocus: "",
    pending: { messages: messages.slice(-60), attempts: 0 },
  };
}

// Applies an end-of-session summary to learner state (vocabulary capture /
// admission, learner facts). Returns what to tell the learner.
async function applySummary(summary, messages, when) {
  let admissions = [];
  if (state.vocabWriteback) {
    // Full admission pipeline: capture + repeat-sighting + promotion +
    // threshold-3 admission, capped at 10/session. Repeat sightings come
    // from the summary (newWords re-reported, recycledWords the tutor
    // says it used — inflection-proof) AND from the exact-form scan of
    // the tutor's replies this session.
    const assistantText = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n");
    const taken = new Set([
      ...Object.keys(state.forms[state.targetLang] || {}),
      ...(state.run.released || []),
    ]);
    const { admitted, collided } = processTutorSession(
      state.run, summary.newWords, assistantText, when, (cid) => taken.has(cid),
      summary.recycledWords
    );
    if (collided.length) {
      console.warn("tutor admission skipped (cid collision):", collided.map((c) => c.word));
    }
    admissions = applyAdmissions(state.run, admitted, when);
  } else {
    // Flag off: capture-only, the pre-write-back behavior.
    const vocab = runPersonalVocab();
    const known = new Set(vocab.map((w) => w.word.toLowerCase()));
    for (const w of Array.isArray(summary.newWords) ? summary.newWords : []) {
      if (w && w.word && !known.has(w.word.toLowerCase()) && vocab.length < MAX_PERSONAL_VOCAB) {
        vocab.push({
          word: w.word,
          translation: w.translation || "",
          note: w.note || "",
          pos: w.pos || "noun",
          exampleSentence: w.exampleSentence || "",
          exampleTranslation: w.exampleTranslation || "",
          seenInSessions: [when],
          admittedAt: null,
        });
        known.add(w.word.toLowerCase());
      }
    }
  }

  if (admissions.length) {
    // Fire-and-forget append to the public.vocab_admissions retention
    // ledger (server-side, service-role writer). Losing a row on a network
    // blip costs analytics, never learner state.
    authFetch("/.netlify/functions/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "admissions",
        lang: state.targetLang,
        admissions,
      }),
    }).catch(() => {});
  }

  // Bounded learner-facts write-path (separate from vocab admission).
  // Fires whether or not vocab write-back is enabled — identity/subject
  // facts are not gated on the write-back cohort.
  const facts = applyTutorLearnerFacts(state.user, summary, when);
  if (facts.dropped.length) {
    console.warn("learner facts dropped (cap or empty):", facts.dropped);
  }
  return { admissions };
}

async function endSession() {
  if (state.busy) return;
  if (state.messages.length < 2) {
    state.messages = [];
    state.pending = null;
    clearLiveTranscript();
    els.chat.innerHTML = "";
    state.topicPicker = null;
    addMessage("status", "Session cleared.");
    showTopicPicker();
    return;
  }

  // The learner is done the moment they press End: the transcript is saved
  // locally and synced right away, the screen clears, and Anna's notes
  // (the slow structured record) are written in the background. If the
  // tab closes first, the record stays marked pending and
  // retryPendingSummaries finishes it on the next visit (Nekh 2026-09-21:
  // nobody should watch a minute of saving).
  setBusy(true);
  const when = todayStamp();
  const messages = state.messages.slice();
  const record = fallbackSessionRecord(messages, when);
  if (state.beta.topics) record.topicId = findTopic(state.user, state.topicId) ? state.topicId : null;
  let saved;
  try {
    pushSessionRecord(record);
    state.messages = [];
    state.pending = null;
    clearLiveTranscript();
    els.chat.innerHTML = "";
    state.topicPicker = null;
    await persistUser();
    saved = addMessage("status", "Session saved. Anna is writing her notes…");
  } catch (err) {
    // Only a local bug can land here. Keep the conversation on screen so
    // nothing is lost.
    console.error("tutor: end session failed locally:", err);
    const mem = tutorMemory();
    mem.sessions = mem.sessions.filter((r) => r !== record);
    state.messages = messages;
    addMessage("status", `Couldn't save the session (${err.message}). The conversation is still here — try End session again.`);
    setBusy(false);
    return;
  }
  setBusy(false);
  els.input.focus();

  const topicId = record.topicId || null;
  // Next conversation: pick again (beta; no-op otherwise).
  showTopicPicker();
  writeSessionNotes(record, messages, when, saved, topicId).catch((err) => console.warn("tutor: session notes:", err));
}

// Background half of End session: ask Anna for the structured record,
// swap it into the saved session, apply the vocabulary and facts, sync.
async function writeSessionNotes(record, messages, when, savedLine, topicId = null) {
  let summary = null;
  let failure = "";
  try {
    const data = await callTutor("summary", messages, { topicId });
    summary = data.summary || null;
    if (!summary) failure = data.truncated ? "notes came back cut off" : data.refused ? "notes were declined" : "no notes came back";
  } catch (err) {
    console.warn("tutor summary failed:", err);
    failure = err.message;
  }
  // The record may have been completed by a retry in another tab meanwhile.
  const stillPending = tutorMemory().sessions.includes(record) && record.pending;
  const say = (text) => {
    if (savedLine && savedLine.isConnected) {
      savedLine.textContent = text;
      savedLine = null;
      return;
    }
    addMessage("status", text);
  };
  if (!summary) {
    say(`Session saved. Anna couldn't write her notes just now (${failure}) — she'll finish them next time you open the tutor.`);
    return;
  }
  if (!stillPending) return;
  let admissions;
  let topicNote;
  try {
    Object.assign(record, sessionRecordFromSummary(summary, when));
    delete record.pending;
    ({ admissions } = await applySummary(summary, messages, when));
    topicNote = applyTopics(record, summary, topicId, when);
    await persistUser();
  } catch (err) {
    console.error("tutor: applying session notes failed:", err);
    say(`Session saved. Anna's notes couldn't be applied (${err.message}).`);
    return;
  }
  say("Session saved. Your tutor will remember this next time.");
  if (topicNote) addMessage("status", topicNote);
  if (summary.nextFocus) addMessage("status", `Next focus: ${summary.nextFocus}`);
  const added = (summary.newWords || []).length;
  if (added) addMessage("status", `New words added to your personal vocabulary: ${added}.`);
  if (admissions.length) {
    addMessage(
      "status",
      `Added to your app vocabulary (seen in 3 sessions): ${admissions.map((a) => a.word).join(", ")}.`
    );
  }
  renderTopicProposals();
}

// Beta: file the session under a topic and queue Anna's proposals. Returns
// the line to show the learner ("" when topics are off or nothing filed).
function applyTopics(record, summary, chosenId, when) {
  if (!state.beta.topics || !summary.topic) return "";
  const { topicId, created } = applyTopicSummary(state.user, record, summary.topic, chosenId, when);
  queueTopicProposals(state.user, summary.proposedTopics, when);
  if (created) return `Anna started a new topic for this conversation: ${created.name}.`;
  const topic = findTopic(state.user, topicId);
  return topic ? `Filed under your topic: ${topic.name}.` : "";
}

// Sessions saved without Anna's notes (see fallbackSessionRecord) get their
// real record written on a later visit, in the background. Bounded attempts
// so a permanently rejected transcript does not retry forever.
async function retryPendingSummaries() {
  const mem = tutorMemory();
  const pendingRecords = mem.sessions.filter((s) => s?.pending?.messages?.length);
  if (!pendingRecords.length) return;
  let changed = false;
  for (const record of pendingRecords) {
    record.pending.attempts = (record.pending.attempts || 0) + 1;
    changed = true;
    try {
      const data = await callTutor("summary", record.pending.messages, { topicId: record.topicId || null });
      if (!data.summary) throw new Error("no summary");
      Object.assign(record, sessionRecordFromSummary(data.summary, record.when));
      await applySummary(data.summary, record.pending.messages, record.when);
      applyTopics(record, data.summary, record.topicId || null, record.when);
      delete record.pending;
      addMessage("status", `Anna finished her notes from ${record.when}.`);
    } catch (err) {
      console.warn("tutor: pending summary retry failed:", err);
      if (record.pending.attempts >= MAX_PENDING_SUMMARY_ATTEMPTS) {
        record.sessionSummary = record.sessionSummary.replace("(Anna's notes for this session are still being written.) ", "");
        delete record.pending;
      }
    }
  }
  if (changed) await persistUser();
  if (changed) renderTopicProposals();
}

// --- Conversation topics (beta) ---------------------------------------------
// Before a conversation starts the learner picks what it is about: one of
// their topics, a new one, or a free conversation. Anna files the session
// at the end and may propose broader topics, which are asked here as
// yes/no questions.

function topicLabel() {
  const topic = findTopic(state.user, state.topicId);
  els.langLabel.textContent = `· ${state.targetLabel}${topic ? ` · ${topic.name}` : ""}`;
}

function closeTopicPicker() {
  if (state.topicPicker) state.topicPicker.remove();
  state.topicPicker = null;
}

function pickTopic(topic) {
  closeTopicPicker();
  state.topicId = topic ? topic.id : null;
  topicLabel();
  if (topic) {
    addMessage("status", topic.notes
      ? `Topic: ${topic.name}. Anna will pick up where you left off — say hi to start.`
      : `Topic: ${topic.name}. Say hi to start.`);
  } else {
    addMessage("status", `Free conversation. Say hi to start — Anna files it under a topic at the end if it has one.`);
  }
  els.input.focus();
}

function showTopicPicker() {
  if (!state.beta.topics || state.messages.length) return;
  closeTopicPicker();
  state.topicId = null;
  topicLabel();
  const box = document.createElement("div");
  box.className = "tutor-topics";
  box.id = "tutor-topics";
  const h = document.createElement("p");
  h.className = "tutor-topics-title";
  h.innerHTML = 'What do you want to talk about? <span class="beta-badge">BETA</span>';
  box.appendChild(h);

  const list = document.createElement("div");
  list.className = "tutor-topics-list";
  for (const { topic, depth } of orderedTopics(state.user)) {
    const row = document.createElement("div");
    row.className = "tutor-topic-row";
    row.style.marginInlineStart = `${Math.min(depth, 3) * 1.25}rem`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tutor-btn secondary tutor-topic";
    b.dataset.topicId = topic.id;
    b.textContent = topic.sessions ? `${topic.name} · ${topic.sessions}` : topic.name;
    b.title = topic.notes || "No conversations yet";
    b.addEventListener("click", () => pickTopic(topic));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "tutor-topic-remove";
    del.textContent = "✕";
    del.setAttribute("aria-label", `Delete topic: ${topic.name}`);
    del.addEventListener("click", () => {
      if (!confirm(`Delete the topic "${topic.name}"? Anna forgets her notes on it. Your saved sessions stay.`)) return;
      removeTopic(state.user, topic.id);
      persistUser();
      showTopicPicker();
    });
    row.append(b, del);
    list.appendChild(row);
  }
  box.appendChild(list);

  const free = document.createElement("button");
  free.type = "button";
  free.className = "tutor-btn secondary tutor-topic-free";
  free.textContent = "Just chat (no topic)";
  free.addEventListener("click", () => pickTopic(null));
  box.appendChild(free);

  const form = document.createElement("form");
  form.className = "tutor-topic-new";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 60;
  input.placeholder = "New topic, e.g. One Piece";
  input.setAttribute("aria-label", "New topic name");
  const add = document.createElement("button");
  add.type = "submit";
  add.className = "tutor-btn";
  add.textContent = "Start topic";
  form.append(input, add);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const topic = createTopic(state.user, input.value, { when: todayStamp() });
    if (!topic) {
      input.focus();
      return;
    }
    persistUser();
    pickTopic(topic);
  });
  box.appendChild(form);

  els.chat.appendChild(box);
  state.topicPicker = box;
  els.chat.scrollTop = els.chat.scrollHeight;
}

// Anna's proposed topics, asked one question at a time.
function renderTopicProposals() {
  if (!state.beta.topics) return;
  document.getElementById("tutor-topic-proposal")?.remove();
  const proposals = getTopicProposals(state.user);
  if (!proposals.length) return;
  const p = proposals[0];
  const box = document.createElement("div");
  box.className = "tutor-msg assistant tutor-topic-proposal";
  box.id = "tutor-topic-proposal";
  box.dir = "auto";
  const q = document.createElement("p");
  q.textContent = p.question;
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "tutor-btn";
  yes.textContent = `Yes, add "${p.name}"`;
  const no = document.createElement("button");
  no.type = "button";
  no.className = "tutor-btn secondary";
  no.textContent = "No thanks";
  const answer = (accept) => {
    const topic = accept ? acceptTopicProposal(state.user, 0, todayStamp()) : (dismissTopicProposal(state.user, 0), null);
    box.remove();
    if (topic) addMessage("status", `New topic: ${topic.name}.`);
    persistUser();
    if (state.topicPicker) showTopicPicker();
    renderTopicProposals();
  };
  yes.addEventListener("click", () => answer(true));
  no.addEventListener("click", () => answer(false));
  const actions = document.createElement("div");
  actions.className = "tutor-topic-proposal-actions";
  actions.append(yes, no);
  box.append(q, actions);
  if (state.topicPicker) els.chat.insertBefore(box, state.topicPicker);
  else els.chat.appendChild(box);
  els.chat.scrollTop = els.chat.scrollHeight;
}

// Standing rule: the build version is visible on every surface. The tutor
// page shows the ?v= its own script was ACTUALLY loaded with — a stale
// cached tutor.html shows its old value, which is exactly the diagnostic
// the display exists to give.
function showBuildVersion() {
  const tag = document.getElementById("tutor-version-tag");
  const src = document.querySelector('script[src*="tutor.js"]')?.getAttribute("src") || "";
  const v = new URLSearchParams(src.split("?")[1] || "").get("v");
  if (tag && v) tag.textContent = `v${v}`;
}

async function init() {
  showBuildVersion();
  // The signed-in learner comes from the Supabase session; `zth_email` is
  // only the app's shim and must agree with it, otherwise the tutor could
  // run on one account's local progress and save under another.
  const session = await getAuthSession();
  const storedEmail = (localStorage.getItem("zth_email") || "").trim().toLowerCase();
  state.email = session && session.email === storedEmail ? session.email : "";
  const { user } = recoverUser(
    localStorage.getItem(USER_KEY),
    localStorage.getItem(USER_BACKUP_KEY)
  );

  if (!state.email || !user) {
    showGate(
      "<p>Log in and start learning in the app first — the tutor builds on your real progress.</p>" +
      '<p><a href="index.html">Go to the app</a></p>'
    );
    return;
  }

  state.user = user;
  state.supportLang = user.supportLanguage || "en";

  // A learner with SEVERAL languages always gets the selection screen — it
  // is the product surface where a language is chosen and word totals are
  // read (restored 2026-08-16 per Nekh: commit ead582f started stamping
  // lastActiveLanguage, which made pickTutorRun's auto-bind happy path fire
  // and silently retired this screen). Auto-start only with exactly one run;
  // the pointer now just sorts the last-used language to the top.
  const pick = pickTutorRun(user);
  if (pick.candidates.length === 1 && pick.run) {
    return startWithRun(pick.targetLang, pick.run);
  }
  if (pick.candidates.length) {
    const candidates = [...pick.candidates].sort((a, b) => {
      if (a.lang === user.lastActiveLanguage) return -1;
      if (b.lang === user.lastActiveLanguage) return 1;
      return 0; // keep pickTutorRun's most-progress-first order otherwise
    });
    els.gate.hidden = false;
    els.gate.innerHTML = "<p>Which language do you want to practice with Anna?</p>";
    const wrap = document.createElement("div");
    wrap.className = "tutor-lang-choices";
    for (const c of candidates) {
      const meta = AVAILABLE_LANGUAGES.find((l) => l.code === c.lang);
      const b = document.createElement("button");
      b.className = "tutor-btn";
      b.type = "button";
      // Pack + tutor-admitted counted separately ("284 + 5 words") so the
      // write-back is visible as a feature.
      b.textContent = `${meta?.label || c.lang} · ${wordCountLabel(c.run)} words`;
      b.addEventListener("click", () => startWithRun(c.lang, c.run));
      wrap.appendChild(b);
    }
    els.gate.appendChild(wrap);
    return;
  }
  if (pick.run) {
    return startWithRun(pick.targetLang, pick.run);
  }

  showGate(
    "<p>No active language found. Pick a language and do a few exercises in the app, then come back.</p>" +
    '<p><a href="index.html">Go to the app</a></p>'
  );
}

async function startWithRun(targetLang, run) {
  state.targetLang = targetLang;
  state.run = run;
  els.gate.hidden = true;
  els.gate.innerHTML = "";

  const targetMeta = AVAILABLE_LANGUAGES.find((l) => l.code === state.targetLang);
  const supportMeta = AVAILABLE_LANGUAGES.find((l) => l.code === state.supportLang);
  state.targetLabel = targetMeta?.label || state.targetLang;
  state.supportLabel = supportMeta?.label || state.supportLang;
  els.langLabel.textContent = `· ${state.targetLabel}`;

  try {
    await loadForms();
  } catch (err) {
    console.warn("vocab load failed:", err);
    showGate("<p>Couldn't load vocabulary data. Check your connection and reload.</p>");
    return;
  }

  // Pre-v4 device-local prefs / sessions move into the synced record.
  let needsPersist = adoptLegacyTutorState();

  restorePreferences();
  els.main.hidden = false;
  els.settingsBtn.hidden = false;
  els.memoryBtn.hidden = false;

  // One-time pull of this device's legacy personal vocab into the run
  // (idempotent — deduped by word, legacy entries left in place).
  const legacy = loadLegacyStore();
  const merged = mergePersonalVocab(state.run.personalVocab, legacy.personalVocab, MAX_PERSONAL_VOCAB);
  state.run.personalVocab = merged.vocab;
  if (merged.added) needsPersist = true;
  if (needsPersist) persistUser();

  // Write-back cohort + beta features. Non-blocking: the chat is usable
  // at once; the topic picker appears when the answer lands (and only if
  // the conversation hasn't started by then).
  const flagsReady = resolveFlags().then((flags) => {
    state.vocabWriteback = flags.vocabWriteback;
    state.beta = flags.beta;
  });

  const mem = tutorMemory();
  if (mem.sessions.length && mem.sessions[0].nextFocus) {
    addMessage("status", `Last time's focus: ${mem.sessions[0].nextFocus}`);
  }

  // A conversation this device never finished (tab closed, reload, crash)
  // comes back exactly where it stopped.
  const live = readJson(liveKey(), null);
  if (Array.isArray(live?.messages) && live.messages.length) {
    state.messages = live.messages.filter((m) => m && typeof m.content === "string");
    state.topicId = typeof live.topicId === "string" ? live.topicId : null;
    renderTranscript(state.messages);
    const when = live.at ? new Date(live.at).toLocaleDateString() : "earlier";
    addMessage("status", `Picked up your unfinished conversation from ${when}. Keep going, or press End session to save it.`);
  }
  const draft = readJson(draftKey(), null);
  if (draft?.text) els.input.value = draft.text;

  // First visit for this language: ask the preferences once, up front.
  // Afterwards they're saved and live behind the ⚙️ button.
  if (!hasSavedPrefs()) {
    openSettings("setup");
  } else if (!state.messages.length) {
    addMessage(
      "status",
      `Say hi to start — try greeting Anna in ${state.targetLabel}.`
    );
  }

  els.send.addEventListener("click", sendMessage);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.input.addEventListener("input", saveDraft);
  els.note.addEventListener("input", updateNoteCount);
  els.end.addEventListener("click", endSession);
  els.settingsBtn.addEventListener("click", () => openSettings("settings"));
  els.settingsSave.addEventListener("click", saveSettings);
  els.settingsClose.addEventListener("click", () => {
    restorePreferences(); // discard unsaved edits
    els.settings.hidden = true;
  });
  els.memoryBtn.addEventListener("click", openMemory);
  els.memoryClose.addEventListener("click", closeMemory);
  els.input.focus();

  flagsReady.then(() => {
    if (!state.beta.topics) return;
    topicLabel();
    renderTopicProposals();
    // First visit: the setup panel is open; the picker waits behind it.
    showTopicPicker();
  });

  // Background: finish any session records Anna could not write earlier.
  // After the flags, so a retried record is filed under its topic.
  flagsReady
    .then(() => retryPendingSummaries())
    .catch((err) => console.warn("tutor: pending summaries:", err));
}

init();
