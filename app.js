// Zero to Hero – Strict Ladder + Dynamic Verb Conjugation
// VERSION: v0.9.74-level6-devstart
 import { AVAILABLE_LANGUAGES } from "./languages.js?v=0.9.74";
 let USER = null;
document.addEventListener("DOMContentLoaded", () => {
  const APP_VERSION = "v0.9.74-level7";
  const MAX_LEVEL = 7;
  const DEV_START_AT_LEVEL_7 = false; // set false after stress testing

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const hubQuitBtn = document.getElementById("hub-quit");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const languageScreen = document.getElementById("language-screen");
  const languageButtonsContainer = document.getElementById("language-buttons");
  const languageState = {
  target: null,
  support: "en" // default for now
  };
  function createEmptyUser() {
  return {
    id: crypto.randomUUID(),
    supportLanguage: "en",
    lastActiveLanguage: null,
    runs: {} // languageCode -> run object
  };
}
function loadUser() {
  const raw = localStorage.getItem("zth_user");
  if (!raw) {
    USER = createEmptyUser();
    saveUser();
  } else {
    USER = JSON.parse(raw);
  }
}

function saveUser() {
  localStorage.setItem("zth_user", JSON.stringify(USER));
}

loadUser();
renderLanguageButtons();
  const VOCAB_FILES = [
    "adjectives.json","connectors.json","directions_positions.json",
    "glue_words.json","nouns.json","numbers.json",
    "politeness_modality.json","pronouns.json","quantifiers.json",
    "question_words.json","time_words.json","verbs.json"
  ];

  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };
  function renderLanguageButtons() {
  languageButtonsContainer.innerHTML = "";

  AVAILABLE_LANGUAGES.forEach(lang => {
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = lang.label;

    btn.onclick = () => enterLanguage(lang.code);

    languageButtonsContainer.appendChild(btn);
  });
}
  async function loadAndMergeVocab() {
    window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

    for (const file of VOCAB_FILES) {
      const res = await fetch(file, { cache: "no-store" });
      const data = await res.json();

      for (const concept of data.concepts || []) {
        window.GLOBAL_VOCAB.concepts[concept.concept_id] = concept;
      }

      for (const [langCode, langData] of Object.entries(data.languages || {})) {
        if (!window.GLOBAL_VOCAB.languages[langCode]) {
          window.GLOBAL_VOCAB.languages[langCode] = { label: langData.label, forms: {} };
        }
        Object.assign(window.GLOBAL_VOCAB.languages[langCode].forms, langData.forms || {});
      }
    }
  }

  let TEMPLATE_CACHE = null;

  async function loadTemplates() {
    if (TEMPLATE_CACHE) return TEMPLATE_CACHE;
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const data = await res.json();
    TEMPLATE_CACHE = data.templates || [];
    return TEMPLATE_CACHE;
  }

  let run = null;


  function ensureProgress(cid) {
  if (!run.progress[cid]) {
    run.progress[cid] = {
      level: 1,
      streak: 0,
      cooldown: 0,
      completed: false,
      lastShownAt: -Infinity,
      lastResult: null
    };
  }
  return run.progress[cid];
}
function ensureTemplateProgress(tpl) {
  const id = tpl.template_id;

  if (!run.templateProgress[id]) {
    run.templateProgress[id] = {
  streak: 0,
  reinforcementStage: 0,
  completed: false,
  lastShownAt: -Infinity,
  lastResult: null
};
  }

  return run.templateProgress[id];
}
function passesSpacingRule(cid) {

  const state = ensureProgress(cid);
  const level = state.level;
  const currentIndex = run.exerciseCounter;

  if (state.lastShownAt === -Infinity) return true;

  const distance = currentIndex - state.lastShownAt;

  // LEVEL 1 → always treated as correct
  if (level === 1) {
    return distance >= 4;
  }

  // LEVEL 7 special rule
  if (level === 7) {
    if (state.lastResult === false) {
      return distance >= 2;
    } else {
      return distance >= 20;
    }
  }

  // Normal levels (2–6)
  if (state.lastResult === false) {
    return distance >= 2;
  } else {
    return distance >= 4;
  }
}

  function levelOf(cid) {
    return ensureProgress(cid).level;
  }

  function decrementCooldowns() {
    Object.values(run.progress).forEach(p => {
      if (p.cooldown > 0) p.cooldown--;
    });
  }

  function initRun() {
    const allConcepts = [
      ...new Set(TEMPLATE_CACHE.flatMap(t => t.concepts || []))
    ];

   run = {
  released: [],
  future: [...allConcepts],
  progress: {},
  templateProgress: {},        // ← ADD
  exerciseCounter: 0,
  recentTemplates: []
};

    batchSeed();
  }

 function batchSeed() {

  const initialBatch = [
    "FIRST_PERSON_SINGULAR",
    "SECOND_PERSON",
    "SECOND_PERSON_PLURAL",
    "HE",
    "SHE",
    "FIRST_PERSON_PLURAL",
    "THIRD_PERSON_PLURAL",
    "EAT", "DRINK", "READ", "SEE", "HAVE",
    "FOOD", "WATER", "BOOK", "PHONE", "JOB"
  ];

  initialBatch.forEach(cid => {
    if (!run.released.includes(cid)) {
      run.released.push(cid);
      ensureProgress(cid);
    }
  });

  run.future = run.future.filter(cid => !run.released.includes(cid));

  // 🔒 DEV START LOGIC (only affects initial state, not routing)
  if (DEV_START_AT_LEVEL_7) {
    run.released.forEach(cid => {
      const state = ensureProgress(cid);
      state.level = 7;
      state.streak = 0;
      state.completed = false;
    });
  }
}

  function applyResult(cid, correct) {
  const state = ensureProgress(cid);

  // 🔒 Spacing tracking (must happen for both correct and incorrect)
  state.lastShownAt = run.exerciseCounter;
  state.lastResult = correct;

  if (!correct) {
    state.streak = 0;
    state.cooldown = 2;
    return;
  }

  state.streak++;
  state.cooldown = 4;

  if (state.streak >= 2) {
    if (state.level < MAX_LEVEL) {
      state.level++;
    } else {
      state.completed = true;
    }
    state.streak = 0;
  }
  USER.runs[languageState.target] = run;
saveUser();
}


  function templateEligible(tpl) {
    return (tpl.concepts || []).every(cid => {
      const st = ensureProgress(cid);
      return run.released.includes(cid) && !st.completed;
    });
  }

  function determineTargetConcept(tpl) {
    let minLevel = Infinity;
    let candidates = [];

    tpl.concepts.forEach(cid => {
      const st = ensureProgress(cid);
      if (st.completed) return;

      if (st.level < minLevel) {
        minLevel = st.level;
        candidates = [cid];
      } else if (st.level === minLevel) {
        candidates.push(cid);
      }
    });

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function chooseTemplate() {
    const eligible = TEMPLATE_CACHE.filter(templateEligible);
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  function formOf(lang, cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
    if (!entry) return cid;
    if (Array.isArray(entry)) return entry[0];
    if (typeof entry === "object" && entry.base) return entry.base;
    return cid;
  }

  function getVerbForm(verbCid, subjectCid, lang) {
    const verbData = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[verbCid];
    if (!verbData) return verbCid;

    const subject = window.GLOBAL_VOCAB.concepts[subjectCid];
    if (!subject) return verbData.base || verbCid;

    const key =
      subject.person === 3 && subject.number === "singular"
        ? "3_singular"
        : subject.person === 1 && subject.number === "singular"
        ? "1_singular"
        : subject.person === 1 && subject.number === "plural"
        ? "1_plural"
        : subject.person === 3 && subject.number === "plural"
        ? "3_plural"
        : "base";

    return verbData[key] || verbData.base || verbCid;
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }
  function safe(v) {
  return v ?? "";
}
  function blankSentence(sentence, surface) {
    const tokens = String(sentence || "").split(" ");
    let replaced = false;
    const targetLower = String(surface || "").toLowerCase();

    // If we don't know what to blank, don't pretend we did.
    if (!targetLower) return String(sentence || "");

    return tokens.map(token => {
      const clean = token.replace(/[.,!?]/g, "").toLowerCase();
      if (!replaced && clean === targetLower) {
        replaced = true;
        const punct = token.match(/[.,!?]+$/);
        return "_____" + (punct ? punct[0] : "");
      }
      return token;
    }).join(" ");
  }

  function safeSurfaceForConcept(tpl, targetLang, targetConcept) {
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    const subjectCid = (tpl.concepts || []).find(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    if (meta.type === "verb") {
      return getVerbForm(targetConcept, subjectCid, targetLang);
    }

    return tpl.surface?.[targetLang]?.[targetConcept] || formOf(targetLang, targetConcept);
  }
function buildSentence(lang, tpl) {
  // If manual render exists, use it
  if (tpl.render?.[lang]) {
    return tpl.render[lang];
  }

  // Otherwise build from concepts
  const words = (tpl.concepts || []).map(cid => {
    const meta = window.GLOBAL_VOCAB.concepts[cid];
    if (!meta) return cid;

    if (meta.type === "verb") {
      const subjectCid = tpl.concepts.find(c =>
        window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
      );
      return getVerbForm(cid, subjectCid, lang);
    }

    return formOf(lang, cid);
  });

  return words.join(" ") + ".";
}

  // -------------------------
  // Recognition option builder
  // -------------------------
  function buildRecognitionOptions(tpl, targetConcept, desiredTotalOptions) {
    const currentLevel = levelOf(targetConcept);
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    // Distractors must be same type, released, not completed, and have level >= currentLevel
    const pool = run.released.filter(cid => {
      if (cid === targetConcept) return false;

      const st = ensureProgress(cid);
      if (st.completed) return false;
      if (st.level < currentLevel) return false;

      const m = window.GLOBAL_VOCAB.concepts[cid];
      return m && m.type === meta.type;
    });

    // recognition requires >=4 options => need at least 3 distractors
    if (pool.length < 3) return null;

    const targetTotal = Math.max(4, Math.min(desiredTotalOptions, pool.length + 1));
    const distractorCount = targetTotal - 1;

    return shuffle([targetConcept, ...shuffle(pool).slice(0, distractorCount)]);
  }

  function renderExposure(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    content.innerHTML = `
  <h2>${safe(formOf(targetLang, targetConcept))}</h2>
  <p>${safe(formOf(supportLang, targetConcept))}</p>
  <hr>
  <p>${safe(buildSentence(targetLang, tpl))}</p>
  <p>${safe(tpl.render?.[supportLang])}</p>
  <button id="continue-btn">Continue</button>
`;

    document.getElementById("continue-btn").onclick = () => {
      decrementCooldowns();
      applyResult(targetConcept, true);
      renderNext(targetLang, supportLang);
    };
  }

  function renderComprehension(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    const role = meta?.type === "pronoun" ? "pronoun"
               : meta?.type === "verb" ? "verb"
               : "object";

    const q = tpl.questions?.[role];

    // If template doesn't support this role, try another prompt rather than crashing
    if (!q?.choices?.length) return renderNext(targetLang, supportLang);

    const options = shuffle([...q.choices]);

    content.innerHTML = `
    <p>${safe(buildSentence(targetLang, tpl))}</p>
    <p><strong>In this sentence:</strong> ${safe(q.prompt?.[supportLang])}</p>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = formOf(supportLang, opt);
      btn.onclick = () => {
        const correct = opt === q.answer;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };
      container.appendChild(btn);
    });
  }

  // -------------------------
  // Level 3 – Recognition (with support sentence shown)
  // -------------------------
  function renderRecognitionL3(targetLang, supportLang, tpl, targetConcept) {

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const targetSentence = safe(buildSentence(targetLang, tpl));
    const supportSentence = safe(tpl.render?.[supportLang]);

    const surface = safeSurfaceForConcept(tpl, targetLang, targetConcept);
    const blanked = blankSentence(targetSentence, surface);

    const options = buildRecognitionOptions(tpl, targetConcept, 4);
    if (!options) return renderNext(targetLang, supportLang);

    const subjectCid = (tpl.concepts || []).find(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    content.innerHTML = `
      <p><strong>Original sentence:</strong></p>
      <p>${supportSentence}</p>
      <hr>
      <p><strong>Fill in the missing word:</strong></p>
      <p>${blanked}</p>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");
    const isSentenceStart = blanked.trim().startsWith("_____");

    options.forEach(opt => {

      const m = window.GLOBAL_VOCAB.concepts[opt];
      let text;

      if (m?.type === "verb") {
        text = getVerbForm(opt, subjectCid, targetLang);
      } else {
        text = tpl.surface?.[targetLang]?.[opt] || formOf(targetLang, opt);
      }

      text = isSentenceStart
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : text.charAt(0).toLowerCase() + text.slice(1);

      const btn = document.createElement("button");
      btn.textContent = text;

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      container.appendChild(btn);
    });
  }

  // -------------------------
  // Level 4 – Isolated Translation Recall
  // (ONLY CHANGED SECTION)
  // -------------------------
  function renderRecognitionL4(targetLang, supportLang, tpl, targetConcept) {

    // Level 4 = Isolated Translation Recall
    // Prompt in support language, options in target language (verbs use base form).
    // Does NOT change ladder rules or global option-builder behavior.

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const promptSupport = formOf(supportLang, targetConcept);

    function resolveTargetSurface(cid) {
  const entry = window.GLOBAL_VOCAB.languages?.[targetLang]?.forms?.[cid];
  const meta = window.GLOBAL_VOCAB.concepts[cid];

  if (entry === undefined || entry === null) return cid;

  // VERBS → strictly base / infinitive only
  if (meta?.type === "verb") {
    if (typeof entry === "object") {
      if (typeof entry.base === "string") return entry.base;
      if (typeof entry.infinitive === "string") return entry.infinitive;
    }
    if (typeof entry === "string") return entry;
    return cid; // do NOT fallback to random conjugation
  }

  // NON-VERBS
  if (typeof entry === "string") return entry;

  if (Array.isArray(entry)) return entry[0];

  if (typeof entry === "object") {
    const firstString = Object.values(entry).find(v => typeof v === "string");
    if (firstString) return firstString;
  }

  return cid;
}

    function buildLevel4Options() {
      const currentLevel = levelOf(targetConcept);
      const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
      if (!meta) return null;

      // Pool rules = identical to buildRecognitionOptions:
      // same type, released, not completed, and level >= currentLevel
      // PLUS: exclude concepts with the same support-surface as the prompt
      //       and enforce unique support-surfaces among distractors.
      const pool = run.released.filter(cid => {
        if (cid === targetConcept) return false;

        const st = ensureProgress(cid);
        if (st.completed) return false;
        if (st.level < currentLevel) return false;

        const m = window.GLOBAL_VOCAB.concepts[cid];
        if (!m || m.type !== meta.type) return false;

        const otherSupport = formOf(supportLang, cid);
        if (otherSupport === promptSupport) return false; // prevents você/vocês together for "you"

        return true;
      });

      if (pool.length < 3) return null;

      // Try to build up to 6 options, but always >= 4
      const desiredTotal = Math.max(4, Math.min(6, pool.length + 1));

      // Shuffle pool and pick distractors with unique support meanings
      const shuffled = shuffle([...pool]);
      const chosen = [targetConcept];
      const usedSupport = new Set([promptSupport]);

      for (const cid of shuffled) {
        if (chosen.length >= desiredTotal) break;

        const s = formOf(supportLang, cid);
        if (usedSupport.has(s)) continue;

        usedSupport.add(s);
        chosen.push(cid);
      }

      // If we couldn't reach 4 options with uniqueness, fall back to strict builder
      // (still respects ladder rules; only loses the "no duplicate meaning" nicety).
      if (chosen.length < 4) {
        return buildRecognitionOptions(tpl, targetConcept, 6);
      }

      return shuffle(chosen);
    }

    const options = buildLevel4Options();
    if (!options) return renderNext(targetLang, supportLang);

    content.innerHTML = `
      <p>Choose the correct translation for:</p>
      <h2>${promptSupport}</h2>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = resolveTargetSurface(opt);

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      container.appendChild(btn);
    });
  }
// -------------------------
// Level 5 – Matching (Wire Style)
// -------------------------
function renderMatchingL5(targetLang, supportLang) {

  subtitle.textContent = "Level 5";

  // Gather eligible concepts
  const eligible = run.released.filter(cid => {
    const st = ensureProgress(cid);
    return (
        st.level === 5 &&
  !st.completed &&
  passesSpacingRule(cid)
    );
  });

  if (eligible.length < 4) {
  // Not enough level-5 concepts — fall back to template-driven routing
  const tpl = chooseTemplate();
  if (!tpl) {
    content.innerHTML = "All concepts completed.";
    return;
  }

  const targetConcept = determineTargetConcept(tpl);
  const level = levelOf(targetConcept);

  if (level === 6) {run.recentTemplates.push(tpl);
if (run.recentTemplates.length > 3) {
  run.recentTemplates.shift();
}

    return renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept);
  }

  if (level === 4) {
    return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
  }

  return renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);
}

  // Shuffle and take max 5
  const shuffled = shuffle([...eligible]);
  const selected = shuffled.slice(0, Math.min(5, shuffled.length));

  // Build left (support) and right (target) columns
  const leftItems = shuffle([...selected]);
  const rightItems = shuffle([...selected]);

  const selectedPairs = new Map();

  content.innerHTML = `
  <div id="matching-wrapper" style="position:relative;">

    <svg id="wire-layer"
         style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></svg>

    <div id="matching-container" style="
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:80px;
      margin-top:20px;
      position:relative;
    ">
      <div id="left-column" style="display:flex;flex-direction:column;gap:20px;"></div>
      <div id="right-column" style="display:flex;flex-direction:column;gap:20px;"></div>
    </div>

    <div style="margin-top:30px;text-align:center;">
      <button id="check-matches">Check</button>
    </div>

  </div>
`;

  const leftColumn = document.getElementById("left-column");
  const rightColumn = document.getElementById("right-column");

  let activeSelection = null;
const wireLayer = document.getElementById("wire-layer");
const connectionLines = new Map();

function drawConnection(leftBtn, rightBtn) {

  const leftRect = leftBtn.getBoundingClientRect();
  const rightRect = rightBtn.getBoundingClientRect();
  const containerRect = document
    .getElementById("matching-wrapper")
    .getBoundingClientRect();

  const x1 = leftRect.right - containerRect.left;
  const y1 = leftRect.top + leftRect.height / 2 - containerRect.top;

  const x2 = rightRect.left - containerRect.left;
  const y2 = rightRect.top + rightRect.height / 2 - containerRect.top;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "white");
  line.setAttribute("stroke-width", "3");

  wireLayer.appendChild(line);

  return line;
}

  function createButton(cid, side) {
  const btn = document.createElement("button");
  btn.textContent = side === "left"
    ? formOf(supportLang, cid)
    : resolveTargetSurface(cid);

  btn.dataset.cid = cid;
  btn.dataset.side = side;

  btn.onclick = () => {

    // Ignore clicks on already matched buttons
    if (btn.classList.contains("matched")) return;

    if (!activeSelection) {
      activeSelection = btn;
      btn.classList.add("selected");
      return;
    }

    // Clicking same button deselects it
    if (activeSelection === btn) {
      btn.classList.remove("selected");
      activeSelection = null;
      return;
    }

    // Clicking same side switches selection
    if (activeSelection.dataset.side === btn.dataset.side) {
      activeSelection.classList.remove("selected");
      activeSelection = btn;
      btn.classList.add("selected");
      return;
    }

    // Opposite side → attempt pairing
    const leftBtn = activeSelection.dataset.side === "left" ? activeSelection : btn;
    const rightBtn = activeSelection.dataset.side === "right" ? activeSelection : btn;

    const leftCid = leftBtn.dataset.cid;
const rightCid = rightBtn.dataset.cid;

// --- Remove existing connection for this LEFT concept ---
if (connectionLines.has(leftCid)) {
  wireLayer.removeChild(connectionLines.get(leftCid));
  connectionLines.delete(leftCid);
  selectedPairs.delete(leftCid);
}

// --- Remove existing connection for this RIGHT concept ---
for (const [lCid, rCid] of selectedPairs.entries()) {
  if (rCid === rightCid) {
    if (connectionLines.has(lCid)) {
      wireLayer.removeChild(connectionLines.get(lCid));
      connectionLines.delete(lCid);
    }
    selectedPairs.delete(lCid);
    break;
  }
}

// --- Create new connection ---
selectedPairs.set(leftCid, rightCid);
const line = drawConnection(leftBtn, rightBtn);
connectionLines.set(leftCid, line);

activeSelection = null;

  };

  return btn;
}


  function resolveTargetSurface(cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[targetLang]?.forms?.[cid];
    const meta = window.GLOBAL_VOCAB.concepts[cid];

    if (!entry) return cid;

    if (meta?.type === "verb") {
      if (typeof entry === "object") {
        if (entry.base) return entry.base;
        if (entry.infinitive) return entry.infinitive;
      }
      if (typeof entry === "string") return entry;
      return cid;
    }

    if (typeof entry === "string") return entry;
    if (Array.isArray(entry)) return entry[0];
    if (typeof entry === "object") {
      const first = Object.values(entry).find(v => typeof v === "string");
      if (first) return first;
    }

    return cid;
  }

  leftItems.forEach(cid => {
    leftColumn.appendChild(createButton(cid, "left"));
  });

  rightItems.forEach(cid => {
    rightColumn.appendChild(createButton(cid, "right"));
  });

  document.getElementById("check-matches").onclick = () => {

  let allCorrect = true;

  selected.forEach(cid => {
    const matched = selectedPairs.get(cid);

    const leftBtn = [...leftColumn.children].find(b => b.dataset.cid === cid);
    const rightBtn = [...rightColumn.children].find(b => b.dataset.cid === matched);

    if (matched === cid) {
      leftBtn.classList.add("matched");
      rightBtn.classList.add("matched");
      applyResult(cid, true);
    } else {
      allCorrect = false;

      if (leftBtn) leftBtn.classList.add("wrong");
      if (rightBtn) rightBtn.classList.add("wrong");

      applyResult(cid, false);
    }
  });

  if (allCorrect) {
  setTimeout(() => {
    renderNext(targetLang, supportLang);
  }, 800);
} else {
  setTimeout(() => {

    // Remove all existing lines (if any)
    connectionLines.forEach(line => {
      if (line && line.parentNode === wireLayer) {
        wireLayer.removeChild(line);
      }
    });
    connectionLines.clear();

    // Clear pairing memory
    selectedPairs.clear();

    renderMatchingL5(targetLang, supportLang);

  }, 1000);
}
  };
}

// -------------------------
// Level 6 – Sentence Builder (Slot-based)
// -------------------------
function renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept) {

  subtitle.textContent = "Level 6";

 let supportSentence = safe(tpl.render?.[supportLang]);
let disambiguation = "";

if (tpl.concepts.includes("SECOND_PERSON_PLURAL")) {
  disambiguation = "(plural)";
}
else if (tpl.concepts.includes("SECOND_PERSON")) {
  disambiguation = "(singular)";
}

const targetSentence = safe(buildSentence(targetLang, tpl));

  // Strip final punctuation for comparison logic
  const cleanedTarget = targetSentence.replace(/[.?]$/, "");
  const punctuationMatch = targetSentence.match(/[.?]$/);
  const punctuation = punctuationMatch ? punctuationMatch[0] : "";

  const correctWords = cleanedTarget
  .split(" ")
  .map(w => w.toLowerCase());

  const wordBank = shuffle([...correctWords]);

  const assignments = new Map(); // slotIndex → word
  let selectedWord = null;

  content.innerHTML = `
  <div style="margin-bottom:20px;">
    <strong>${supportSentence}</strong>
    ${disambiguation ? `<div style="font-size:12px;opacity:0.7;margin-top:4px;">${disambiguation}</div>` : ""}
  </div>

    <div id="slot-container" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;"></div>

    <div id="word-bank" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;"></div>

    <div style="text-align:center;">
      <button id="check-l6">Check</button>
    </div>
  `;

  const slotContainer = document.getElementById("slot-container");
  const bankContainer = document.getElementById("word-bank");

  // Create slots
  correctWords.forEach((_, index) => {
    const slot = document.createElement("div");
    slot.className = "sentence-slot";
    slot.dataset.index = index;
    slot.style.minWidth = "60px";
    slot.style.padding = "8px 12px";
    slot.style.borderRadius = "8px";
    slot.style.backgroundColor = "#3e1f4f";
    slot.style.border = "2px solid white";
    slot.style.color = "white";
    slot.style.textAlign = "center";
    slot.style.cursor = "pointer";

    slot.onclick = () => {
      const i = Number(slot.dataset.index);

      // If slot already filled → return word to bank
      if (assignments.has(i)) {
        const returnedWord = assignments.get(i);
        assignments.delete(i);
        slot.textContent = "";
        createBankWord(returnedWord);
      }
    };

    slotContainer.appendChild(slot);
  });

  // Create word bank items
  function createBankWord(word) {
    const btn = document.createElement("button");
    btn.textContent = word;

    btn.onclick = () => {
      selectedWord = btn;
      btn.classList.add("selected");
    };

    bankContainer.appendChild(btn);
  }

  wordBank.forEach(createBankWord);

  // Slotting logic
  slotContainer.addEventListener("click", e => {
    if (!selectedWord) return;

    const slot = e.target.closest(".sentence-slot");
    if (!slot) return;

    const slotIndex = Number(slot.dataset.index);
    const word = selectedWord.textContent;

    // If slot already filled, return previous word
    if (assignments.has(slotIndex)) {
      const oldWord = assignments.get(slotIndex);
      createBankWord(oldWord);
    }

    assignments.set(slotIndex, word);
    slot.textContent = word;

    selectedWord.remove();
    selectedWord = null;
  });

  document.getElementById("check-l6").onclick = () => {

    const builtSentence = correctWords.map((_, i) => assignments.get(i) || "").join(" ");

    if (builtSentence.toLowerCase() === cleanedTarget.toLowerCase()) {

  // Visual confirmation (green slots)
  document.querySelectorAll(".sentence-slot").forEach(slot => {
    slot.style.backgroundColor = "#4CAF50";
  });

  const tState = ensureTemplateProgress(tpl);

tState.streak++;
tState.lastResult = true;
tState.lastShownAt = run.exerciseCounter;

if (tState.streak >= 2) {
  tState.completed = true;
}

  setTimeout(() => renderNext(targetLang, supportLang), 800);
} else {
  // Visual feedback (red slots)
  document.querySelectorAll(".sentence-slot").forEach(slot => {
    slot.style.backgroundColor = "#D32F2F";
  });

 const tState = ensureTemplateProgress(tpl);

tState.streak = 0;
tState.lastResult = false;
tState.lastShownAt = run.exerciseCounter;

  setTimeout(() => renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept), 1000);
}
  };
}
// -------------------------
// Level 7 – Free Sentence Production
// -------------------------
function renderFreeProductionL7(targetLang, supportLang, tpl) {

  subtitle.textContent = "Level 7";

 let supportSentence = safe(tpl.render?.[supportLang]);
let disambiguation = "";

if (tpl.concepts.includes("SECOND_PERSON_PLURAL")) {
  disambiguation = "(plural)";
}
else if (tpl.concepts.includes("SECOND_PERSON")) {
  disambiguation = "(singular)";
}

const targetSentence = safe(buildSentence(targetLang, tpl));

  content.innerHTML = `
  <div style="margin-bottom:20px;">
    <strong>${supportSentence}</strong>
    ${disambiguation ? `<div style="font-size:12px;opacity:0.7;margin-top:4px;">${disambiguation}</div>` : ""}
  </div>
  
    <div style="margin-bottom:20px;">
      <input id="l7-input" type="text" style="
        width:100%;
        padding:10px;
        font-size:16px;
        border-radius:8px;
        border:2px solid white;
        background:#3e1f4f;
        color:white;
      " />
    </div>

    <div style="text-align:center;">
      <button id="check-l7">Check</button>
    </div>

    <div id="l7-feedback" style="margin-top:15px;text-align:center;"></div>
  `;

  function normalizeStrict(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[.?]$/, "");
  }

  function normalizeLoose(str) {
    return normalizeStrict(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const checkBtn = document.getElementById("check-l7");
const feedbackDiv = document.getElementById("l7-feedback");
const inputField = document.getElementById("l7-input");

checkBtn.onclick = () => {

  const userInput = inputField.value;

  const strictUser = normalizeStrict(userInput);
  const strictCorrect = normalizeStrict(correctSentence);

  const looseUser = normalizeLoose(userInput);
  const looseCorrect = normalizeLoose(correctSentence);

  const tState = ensureTemplateProgress(tpl);

  let resultType = null;

  if (strictUser === strictCorrect) {
    resultType = "perfect";
  }
  else if (looseUser === looseCorrect) {
    resultType = "accent";
  }
  else {
    resultType = "incorrect";
  }

  // 🔒 Update progression state
  if (resultType === "perfect" || resultType === "accent") {

    tState.reinforcementStage++;
    tState.lastShownAt = run.exerciseCounter;

    if (tState.reinforcementStage >= 3) {
      tState.completed = true;
    }

  } else {
    tState.reinforcementStage = 0;
    tState.lastShownAt = run.exerciseCounter;
  }

  // 🎨 Visual Feedback
  inputField.disabled = true;

  if (resultType === "perfect") {
    inputField.style.borderColor = "#4CAF50";
    feedbackDiv.innerHTML = `<div style="color:#4CAF50;">Correct.</div>`;
  }

  if (resultType === "accent") {
    inputField.style.borderColor = "#4CAF50";
    feedbackDiv.innerHTML = `
      <div style="color:#4CAF50;">
        Correct.<br/>
        Proper form: <strong>${correctSentence}</strong>
      </div>`;
  }

  if (resultType === "incorrect") {
    inputField.style.borderColor = "#D32F2F";
    feedbackDiv.innerHTML = `
      <div style="color:#D32F2F;">
        Incorrect.<br/>
        Correct answer: <strong>${correctSentence}</strong>
      </div>`;
  }

  // 🔁 Replace Check with Continue
  checkBtn.textContent = "Continue";
  checkBtn.onclick = () => {
    renderNext(targetLang, supportLang);
  };
};
}

  // -------------------------
  // Next item (with guard to avoid recursive stack blow-ups)
  // -------------------------
  async function enterLanguage(langCode) {
  languageState.target = langCode;

  await loadAndMergeVocab();
  await loadTemplates();

if (!USER.runs[langCode]) {
  initRun();
  USER.runs[langCode] = run;
  saveUser();
} else {
  run = USER.runs[langCode];
}

  languageScreen.classList.remove("active");
  learningScreen.classList.add("active");

  renderNext(languageState.target, languageState.support);
}
  // -------------------------
  // Next item (with guard to avoid recursive stack blow-ups)
  // -------------------------
  function renderNext(targetLang, supportLang) {

  if (!run) return;
run.exerciseCounter++;
 for (let attempts = 0; attempts < 30; attempts++) {

  const tpl = chooseTemplate();
  if (!tpl) {
    content.innerHTML = "All concepts completed.";
    return;
  }
  // 🔒 Skip fully completed Level 7 templates
if (run.templateProgress[tpl.template_id]?.completed) {
  continue;
}

// 🔒 Future prerequisite gating (inactive unless "requires" exists)
if (tpl.requires) {
  const prereq = run.templateProgress[tpl.requires];
  if (!prereq || prereq.reinforcementStage < 3) {
    continue;
  }
}

      const targetConcept = determineTargetConcept(tpl);
const level = levelOf(targetConcept);

// 🔒 Level 7 template spacing
if (level >= 7) {
  const tState = ensureTemplateProgress(tpl);
  const distance = run.exerciseCounter - tState.lastShownAt;

  if (tState.reinforcementStage === 0 && distance < 5) continue;
  if (tState.reinforcementStage === 1 && distance < 10) continue;
  if (tState.reinforcementStage === 2 && distance < 40) continue;
}

// Concept-based spacing only for levels below 6
if (level < 6) {
  if (!passesSpacingRule(targetConcept)) {
    continue;
  }
}

// Template-based spacing for Level 6+
if (level >= 6) {
  const tState = ensureTemplateProgress(tpl);

  const distance = run.exerciseCounter - tState.lastShownAt;

  if (tState.lastShownAt !== -Infinity && distance < 4) {
    continue;
  }
}

      // Level 3/4 need recognition option integrity; if not possible, try again.
      if (level >= 3) {
        const desired = level === 4 ? 6 : 4;
        const opts = buildRecognitionOptions(tpl, targetConcept, desired);
        if (!opts) continue;
      }

      if (level === 1) return renderExposure(targetLang, supportLang, tpl, targetConcept);
      if (level === 2) return renderComprehension(targetLang, supportLang, tpl, targetConcept);
      if (level === 3) return renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);
      if (level === 4) return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
      if (level === 5) return renderMatchingL5(targetLang, supportLang);
      if (level === 6) return renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept);
      if (level === 7) return renderFreeProductionL7(targetLang, supportLang, tpl);


// Fallback safeguard (should never trigger if ladder is correct)
return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
    }

    // If we get here, it's almost always: "not enough eligible distractors at currentLevel"
    content.innerHTML = `
      <p><strong>No eligible items right now.</strong></p>
      <p>This usually means the strict distractor rule can't be satisfied yet (needs more concepts at the same level).</p>
    `;
  }

  openAppBtn.addEventListener("click", () => {
  startScreen.classList.remove("active");
  languageScreen.classList.add("active");
});

    

 function returnToHome() {
  learningScreen.classList.remove("active");
  languageScreen.classList.remove("active");
  startScreen.classList.add("active");
}

if (quitBtn) {
  quitBtn.addEventListener("click", returnToHome);
}

if (hubQuitBtn) {
  hubQuitBtn.addEventListener("click", returnToHome);
}
});