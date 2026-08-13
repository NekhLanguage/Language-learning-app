// tutor.js — the AI Tutor test page (tutor.html).
// Reads the learner's real app state (read-only — never writes zth_user),
// builds the mastery profile, and drives a chat with the tutor serverless
// function. Session memory + personal vocabulary live in their own
// localStorage key per target language, separate from the versioned USER blob.

import { recoverUser, USER_KEY, USER_BACKUP_KEY } from "./storage.mjs";
import { AVAILABLE_LANGUAGES } from "./languages.js";
import { buildProfileText, buildMemoryText } from "./tutor_profile.mjs";

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
};

const state = {
  email: "",
  targetLang: "",
  supportLang: "",
  targetLabel: "",
  supportLabel: "",
  run: null,
  forms: {},        // lang -> cid -> entry
  messages: [],     // [{role, content}]
  busy: false,
};

function tutorStoreKey() { return `zth_tutor_${state.targetLang}`; }
function prefsStoreKey() { return `zth_tutor_prefs_${state.targetLang}`; }

function loadTutorStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(tutorStoreKey()) || "{}");
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      personalVocab: Array.isArray(parsed.personalVocab) ? parsed.personalVocab : [],
    };
  } catch {
    return { sessions: [], personalVocab: [] };
  }
}

function saveTutorStore(store) {
  localStorage.setItem(tutorStoreKey(), JSON.stringify(store));
}

function currentPreferences() {
  return {
    correctionDepth: els.prefCorrection.value,
    challenge: els.prefChallenge.value,
    languageMix: els.prefLanguageMix.value,
    note: els.note.value.trim().slice(0, 300),
  };
}

function restorePreferences() {
  try {
    const p = JSON.parse(localStorage.getItem(prefsStoreKey()) || "{}");
    if (p.correctionDepth) els.prefCorrection.value = p.correctionDepth;
    if (p.challenge) els.prefChallenge.value = p.challenge;
    if (p.languageMix) els.prefLanguageMix.value = p.languageMix;
    if (p.note) els.note.value = p.note;
  } catch {
    // defaults stay
  }
}

function persistPreferences() {
  localStorage.setItem(prefsStoreKey(), JSON.stringify(currentPreferences()));
}

function showGate(html) {
  els.gate.hidden = false;
  els.gate.innerHTML = html;
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `tutor-msg ${role}`;
  div.dir = "auto";
  div.textContent = text;
  els.chat.appendChild(div);
  els.chat.scrollTop = els.chat.scrollHeight;
  return div;
}

function setBusy(busy) {
  state.busy = busy;
  els.send.disabled = busy;
  els.end.disabled = busy;
  els.input.disabled = busy;
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

function buildRequestBody(mode) {
  const store = loadTutorStore();
  return {
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
      personalVocab: store.personalVocab,
    }),
    preferences: currentPreferences(),
    memory: buildMemoryText(store),
    messages: state.messages,
  };
}

async function callTutor(mode) {
  const res = await fetch("/.netlify/functions/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(mode)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Tutor request failed (${res.status})`);
  }
  return res.json();
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  els.input.value = "";
  persistPreferences();

  state.messages.push({ role: "user", content: text });
  addMessage("user", text);

  const thinking = addMessage("status", "…");
  setBusy(true);
  try {
    const data = await callTutor("chat");
    thinking.remove();
    if (data.refused || !data.reply) {
      addMessage("status", "The tutor couldn't answer that one — try rephrasing.");
      return;
    }
    state.messages.push({ role: "assistant", content: data.reply });
    addMessage("assistant", data.reply);
  } catch (err) {
    console.warn("tutor chat failed:", err);
    thinking.remove();
    // Keep the user's message in state so retrying re-sends it.
    addMessage("status", `Couldn't reach your tutor (${err.message}). Try again.`);
  } finally {
    setBusy(false);
    els.input.focus();
  }
}

async function endSession() {
  if (state.busy) return;
  if (state.messages.length < 2) {
    state.messages = [];
    els.chat.innerHTML = "";
    addMessage("status", "Session cleared.");
    return;
  }

  const saving = addMessage("status", "Wrapping up your session…");
  setBusy(true);
  try {
    const data = await callTutor("summary");
    saving.remove();
    const summary = data.summary;
    if (!summary) throw new Error("no summary returned");

    const store = loadTutorStore();
    store.sessions.unshift({
      when: new Date().toISOString().slice(0, 10),
      sessionSummary: summary.sessionSummary || "",
      struggles: Array.isArray(summary.struggles) ? summary.struggles : [],
      nextFocus: summary.nextFocus || "",
    });
    store.sessions = store.sessions.slice(0, MAX_STORED_SESSIONS);

    const known = new Set(store.personalVocab.map((w) => w.word.toLowerCase()));
    for (const w of Array.isArray(summary.newWords) ? summary.newWords : []) {
      if (w && w.word && !known.has(w.word.toLowerCase())) {
        store.personalVocab.push({
          word: w.word,
          translation: w.translation || "",
          note: w.note || "",
        });
        known.add(w.word.toLowerCase());
      }
    }
    store.personalVocab = store.personalVocab.slice(0, MAX_PERSONAL_VOCAB);
    saveTutorStore(store);

    state.messages = [];
    els.chat.innerHTML = "";
    addMessage("status", "Session saved. Your tutor will remember this next time.");
    if (summary.nextFocus) addMessage("status", `Next focus: ${summary.nextFocus}`);
    const added = (summary.newWords || []).length;
    if (added) addMessage("status", `New words added to your personal vocabulary: ${added}.`);
  } catch (err) {
    console.warn("tutor summary failed:", err);
    saving.remove();
    addMessage("status", `Couldn't save the session (${err.message}). The conversation is still here — try End session again.`);
  } finally {
    setBusy(false);
  }
}

async function init() {
  state.email = (localStorage.getItem("zth_email") || "").trim();
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

  state.targetLang = user.lastActiveLanguage || "";
  state.supportLang = user.supportLanguage || "en";
  state.run = state.targetLang && user.runs ? user.runs[state.targetLang] : null;

  if (!state.targetLang || !state.run) {
    showGate(
      "<p>No active language found. Pick a language and do a few exercises in the app, then come back.</p>" +
      '<p><a href="index.html">Go to the app</a></p>'
    );
    return;
  }

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

  restorePreferences();
  els.main.hidden = false;

  const store = loadTutorStore();
  if (store.sessions.length && store.sessions[0].nextFocus) {
    addMessage("status", `Last time's focus: ${store.sessions[0].nextFocus}`);
  }
  addMessage(
    "status",
    `Say hi to start — try greeting your tutor in ${state.targetLabel}.`
  );

  els.send.addEventListener("click", sendMessage);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.end.addEventListener("click", endSession);
  els.input.focus();
}

init();
