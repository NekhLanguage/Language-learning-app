// Zero to Hero – Strict Ladder + Dynamic Verb Conjugation
// VERSION: v0.9.34-level4-stable-dev

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.34-level4-stable-dev";
  const MAX_LEVEL = 4;
  const DEV_START_AT_LEVEL_4 = true; // set false after stress testing

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  const VOCAB_FILES = [
    "adjectives.json","connectors.json","directions_positions.json",
    "glue_words.json","nouns.json","numbers.json",
    "politeness_modality.json","pronouns.json","quantifiers.json",
    "question_words.json","time_words.json","verbs.json"
  ];

  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

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
        completed: false
      };
    }
    return run.progress[cid];
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
      progress: {}
    };

    batchSeed();
  }

  function batchSeed() {
    const initialBatch = [
      "FIRST_PERSON_SINGULAR",
      "SECOND_PERSON",
      "SECOND_PERSON_PLURAL",
      "HE","SHE",
      "FIRST_PERSON_PLURAL",
      "THIRD_PERSON_PLURAL",
      "EAT","DRINK","READ","SEE","HAVE",
      "FOOD","WATER","BOOK","PHONE","JOB"
    ];

    initialBatch.forEach(cid => {
      run.released.push(cid);
      ensureProgress(cid);
    });

    run.future = run.future.filter(cid => !run.released.includes(cid));

    if (DEV_START_AT_LEVEL_4) {
      run.released.forEach(cid => {
        const state = ensureProgress(cid);
        state.level = 4;
        state.streak = 0;
      });
    }
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);

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
  }

  function formOf(lang, cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
    if (!entry) return cid;
    if (Array.isArray(entry)) return entry[0];
    if (typeof entry === "object" && entry.base) return entry.base;
    return entry;
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function buildRecognitionOptions(targetConcept, desiredTotalOptions, supportLang) {
    const currentLevel = levelOf(targetConcept);
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    const supportWord = formOf(supportLang, targetConcept);

    const pool = run.released.filter(cid => {
      if (cid === targetConcept) return false;

      const st = ensureProgress(cid);
      if (st.completed) return false;
      if (st.level < currentLevel) return false;

      const m = window.GLOBAL_VOCAB.concepts[cid];
      if (!m || m.type !== meta.type) return false;

      // Prevent duplicate support-language meanings (e.g. "you")
      const otherSupport = formOf(supportLang, cid);
      if (otherSupport === supportWord) return false;

      return true;
    });

    if (pool.length < 3) return null;

    const total = Math.max(4, Math.min(desiredTotalOptions, pool.length + 1));
    const distractorCount = total - 1;

    return shuffle([targetConcept, ...shuffle(pool).slice(0, distractorCount)]);
  }

  function renderRecognitionL4(targetLang, supportLang, targetConcept) {

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const supportWord = formOf(supportLang, targetConcept);
    const options = buildRecognitionOptions(targetConcept, 6, supportLang);
    if (!options) return renderNext(targetLang, supportLang);

    content.innerHTML = `
      <p>Choose the correct translation for:</p>
      <h2>${supportWord}</h2>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");
    const targetForms = window.GLOBAL_VOCAB.languages?.[targetLang]?.forms || {};

    options.forEach(opt => {

      const meta = window.GLOBAL_VOCAB.concepts[opt];
      const entry = targetForms[opt];

      let text = opt;

      if (entry !== undefined) {
        if (meta?.type === "verb") {
          text = typeof entry === "object" && entry.base ? entry.base : formOf(targetLang, opt);
        } else if (Array.isArray(entry)) {
          text = entry[0];
        } else if (typeof entry === "object" && entry.base) {
          text = entry.base;
        } else {
          text = entry;
        }
      }

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

  function renderNext(targetLang, supportLang) {

    const active = run.released.filter(cid => {
      const st = ensureProgress(cid);
      return !st.completed;
    });

    if (!active.length) {
      content.innerHTML = "All concepts completed.";
      return;
    }

    const targetConcept = active[Math.floor(Math.random() * active.length)];
    renderRecognitionL4(targetLang, supportLang, targetConcept);
  }

  openAppBtn?.addEventListener("click", async () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");

    const tl = targetSel?.value || "pt";
    const sl = supportSel?.value || "en";

    await loadAndMergeVocab();
    await loadTemplates();
    initRun();
    renderNext(tl, sl);
  });

  quitBtn?.addEventListener("click", () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  });

});
