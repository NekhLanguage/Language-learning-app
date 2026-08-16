// tutor.js — the AI Tutor test page (tutor.html).
// Reads the learner's real app state, builds the mastery profile, and drives
// a chat with the tutor serverless function. Session memory lives in a
// device-local localStorage key per target language; personal vocabulary is
// canonical on USER.runs[lang].personalVocab (schema v2) so it syncs
// cross-device, and the only zth_user writes made here go through the same
// persist-then-sync shape as app.js's saveUser().

import { recoverUser, USER_KEY, USER_BACKUP_KEY } from "./storage.mjs";
import { AVAILABLE_LANGUAGES } from "./languages.js";
import { buildProfileText, buildMemoryText, pickTutorRun, mergePersonalVocab, wordCountLabel } from "./tutor_profile.mjs";
import { processTutorSession, applyAdmissions } from "./tutor_admission.mjs";
import {
  getLearnerFacts,
  renderLearnerFactsText,
  applyTutorLearnerFacts,
} from "./learner_facts.mjs";

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
  settings: document.getElementById("tutor-settings"),
  settingsBtn: document.getElementById("tutor-settings-btn"),
  settingsTitle: document.getElementById("tutor-settings-title"),
  settingsSave: document.getElementById("tutor-settings-save"),
  settingsClose: document.getElementById("tutor-settings-close"),
  settingsHint: document.getElementById("tutor-settings-hint"),
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
  // Vocabulary write-back cohort flag. Plumbing only for now — resolved at
  // session start, gates nothing until the admission logic ships.
  vocabWriteback: false,
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
// the tutor-owned fields (personalVocab / pendingAdmission) onto it instead
// of overwriting wholesale. (The reverse race — an app tab saving its stale
// in-memory blob AFTER this write — can't be fixed from this side.)
async function persistUser() {
  let user = state.user;
  if (!user || !user.runs) return;
  // Snapshot tutor-owned user-level fields BEFORE the merge-on-write swap
  // below reassigns state.user to the freshly-loaded blob — otherwise the
  // graft would copy stored.learnerFacts back onto itself and this
  // session's fact writes would be lost.
  const tutorLearnerFacts = Array.isArray(user.learnerFacts) ? user.learnerFacts : null;
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
    // learnerFacts is a user-level tutor-owned field (bounded via
    // learner_facts.mjs). Graft the snapshot onto the freshly-loaded stored
    // blob so an app tab that saved after the tutor page loaded doesn't
    // roll back this session's fact writes. The app never writes learnerFacts.
    if (tutorLearnerFacts) stored.learnerFacts = tutorLearnerFacts;
  }
  user.lastLocalChange = Date.now();
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const email = state.email.toLowerCase();
  if (!email) return;
  try {
    await fetch("/.netlify/functions/saveUser", {
      method: "POST",
      body: JSON.stringify({ email, user }),
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
async function resolveWritebackFlag() {
  const override = localStorage.getItem("zth_tutor_writeback_override");
  if (override === "on") return true;
  if (override === "off") return false;
  try {
    const res = await fetch("/.netlify/functions/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ping", email: state.email }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.vocabWriteback === true;
  } catch {
    return false;
  }
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

function hasSavedPrefs() {
  return localStorage.getItem(prefsStoreKey()) !== null;
}

// One panel, two modes: "setup" (first visit, blocking, no close) and
// "settings" (later edits via the ⚙️ button, closable without saving).
function openSettings(mode) {
  els.settingsTitle.textContent = mode === "setup" ? "Set up Anna" : "Settings";
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
    addMessage("status", "Settings saved.");
  }
  els.input.focus();
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
      // Pending-admission words are still tutor-held vocabulary — keep them
      // visible to the model so it recycles them (which is exactly what
      // earns their next sighting).
      personalVocab: [...runPersonalVocab(), ...(state.run.pendingAdmission || [])],
    }),
    preferences: currentPreferences(),
    memory: buildMemoryText(store),
    // Bounded (20-entry hard cap on the client), user-level, cross-language.
    // The function renders them at the top of the system prompt above the
    // vocab profile — see learner_facts.mjs and netlify/functions/tutor.js.
    learnerFacts: renderLearnerFactsText(getLearnerFacts(state.user)),
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
    if (res.status === 503) {
      throw new Error("Anna isn't fully set up on the server yet — missing API key");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Tutor request failed (${res.status})`);
  }
  return res.json();
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || state.busy) return;
  els.input.value = "";

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

    const today = new Date().toISOString().slice(0, 10);
    const store = loadTutorStore();
    store.sessions.unshift({
      when: today,
      sessionSummary: summary.sessionSummary || "",
      struggles: Array.isArray(summary.struggles) ? summary.struggles : [],
      nextFocus: summary.nextFocus || "",
    });
    store.sessions = store.sessions.slice(0, MAX_STORED_SESSIONS);
    saveTutorStore(store);

    // New words land on the run's canonical list (schema v2) so they sync
    // cross-device. The legacy store.personalVocab is no longer written —
    // its existing entries were merged in at startWithRun and are kept in
    // place so a rollback loses nothing.
    let admissions = [];
    if (state.vocabWriteback) {
      // Full admission pipeline: capture + repeat-sighting + promotion +
      // threshold-3 admission, capped at 10/session. Repeat sightings come
      // from the summary AND from the tutor re-using a held word in its
      // replies this session.
      const assistantText = state.messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n");
      const taken = new Set([
        ...Object.keys(state.forms[state.targetLang] || {}),
        ...(state.run.released || []),
      ]);
      const { admitted, collided } = processTutorSession(
        state.run, summary.newWords, assistantText, today, (cid) => taken.has(cid)
      );
      if (collided.length) {
        console.warn("tutor admission skipped (cid collision):", collided.map((c) => c.word));
      }
      admissions = applyAdmissions(state.run, admitted, today);
      await persistUser();
    } else {
      // Flag off: capture-only, the pre-write-back behavior.
      const vocab = runPersonalVocab();
      const known = new Set(vocab.map((w) => w.word.toLowerCase()));
      let captured = false;
      for (const w of Array.isArray(summary.newWords) ? summary.newWords : []) {
        if (w && w.word && !known.has(w.word.toLowerCase()) && vocab.length < MAX_PERSONAL_VOCAB) {
          vocab.push({
            word: w.word,
            translation: w.translation || "",
            note: w.note || "",
            pos: w.pos || "noun",
            exampleSentence: w.exampleSentence || "",
            exampleTranslation: w.exampleTranslation || "",
            seenInSessions: [today],
            admittedAt: null,
          });
          known.add(w.word.toLowerCase());
          captured = true;
        }
      }
      if (captured) await persistUser();
    }

    if (admissions.length) {
      // Fire-and-forget append to the public.vocab_admissions retention
      // ledger (server-side, service-role writer). Losing a row on a network
      // blip costs analytics, never learner state.
      fetch("/.netlify/functions/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "admissions",
          email: state.email,
          lang: state.targetLang,
          admissions,
        }),
      }).catch(() => {});
    }

    // Bounded learner-facts write-path (separate from vocab admission).
    // Fires whether or not vocab write-back is enabled — identity/subject
    // facts are not gated on the write-back cohort.
    const facts = applyTutorLearnerFacts(state.user, summary, today);
    if (facts.added.length || facts.corrected.length) {
      await persistUser();
    }
    if (facts.dropped.length) {
      console.warn("learner facts dropped (cap or empty):", facts.dropped);
    }

    state.messages = [];
    els.chat.innerHTML = "";
    addMessage("status", "Session saved. Your tutor will remember this next time.");
    if (summary.nextFocus) addMessage("status", `Next focus: ${summary.nextFocus}`);
    const added = (summary.newWords || []).length;
    if (added) addMessage("status", `New words added to your personal vocabulary: ${added}.`);
    if (admissions.length) {
      addMessage(
        "status",
        `Added to your app vocabulary (seen in 3 sessions): ${admissions.map((a) => a.word).join(", ")}.`
      );
    }
  } catch (err) {
    console.warn("tutor summary failed:", err);
    saving.remove();
    addMessage("status", `Couldn't save the session (${err.message}). The conversation is still here — try End session again.`);
  } finally {
    setBusy(false);
  }
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
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;max-width:320px;margin:16px auto 0;";
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

  restorePreferences();
  els.main.hidden = false;
  els.settingsBtn.hidden = false;

  const store = loadTutorStore();

  // One-time pull of this device's legacy personal vocab into the run
  // (idempotent — deduped by word, legacy entries left in place).
  const merged = mergePersonalVocab(state.run.personalVocab, store.personalVocab, MAX_PERSONAL_VOCAB);
  state.run.personalVocab = merged.vocab;
  if (merged.added) persistUser();

  // Plumbing only: the flag is resolved and stored, but nothing gates on it
  // until the admission logic ships.
  resolveWritebackFlag().then((on) => { state.vocabWriteback = on; });

  if (store.sessions.length && store.sessions[0].nextFocus) {
    addMessage("status", `Last time's focus: ${store.sessions[0].nextFocus}`);
  }

  // First visit for this language: ask the preferences once, up front.
  // Afterwards they're saved and live behind the ⚙️ button.
  if (!hasSavedPrefs()) {
    openSettings("setup");
  } else {
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
  els.end.addEventListener("click", endSession);
  els.settingsBtn.addEventListener("click", () => openSettings("settings"));
  els.settingsSave.addEventListener("click", saveSettings);
  els.settingsClose.addEventListener("click", () => {
    restorePreferences(); // discard unsaved edits
    els.settings.hidden = true;
  });
  els.input.focus();
}

init();
