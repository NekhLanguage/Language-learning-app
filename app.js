// Zero to Hero – Strict Ladder Engine
// VERSION: v0.9.23-strict-levels

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.23-strict-levels";
  const MAX_LEVEL = 4; // Temporary cap until Level 5 exists

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  console.log("Running:", APP_VERSION);
  document.title = "Zero-to-Hero • " + APP_VERSION;

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
      run.progress[cid] = { level: 1, streak: 0 };
    }
    return run.progress[cid];
  }

  function levelOf(cid) {
    return ensureProgress(cid).level;
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

    seedWithFirstTemplate();
  }

  function seedWithFirstTemplate() {
    if (!TEMPLATE_CACHE.length) return;
    const first = TEMPLATE_CACHE[0].concepts || [];

    first.forEach(cid => {
      run.released.push(cid);
      ensureProgress(cid);
    });

    run.future = run.future.filter(cid => !first.includes(cid));
  }

  function releaseConcepts(n) {
    for (let i = 0; i < n && run.future.length > 0; i++) {
      const cid = run.future.shift();
      run.released.push(cid);
      ensureProgress(cid);
    }
  }

  function templateEligible(tpl) {
    return (tpl.concepts || []).every(cid => run.released.includes(cid));
  }

  function determineTargetConcept(tpl) {
    let minLevel = Infinity;
    let candidates = [];

    tpl.concepts.forEach(cid => {
      const lvl = levelOf(cid);
      if (lvl < minLevel) {
        minLevel = lvl;
        candidates = [cid];
      } else if (lvl === minLevel) {
        candidates.push(cid);
      }
    });

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);

    if (!correct) {
      state.streak = 0;
      return;
    }

    state.streak++;

    if (state.streak >= 2) {
      if (state.level < MAX_LEVEL) {
        state.level++;
      }
      state.streak = 0;

      if (state.level === 3) {
        releaseConcepts(1);
      }
    }
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
    return cid;
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function blankSentence(sentence, surface) {
    const tokens = sentence.split(" ");
    let replaced = false;
    const targetLower = String(surface || "").toLowerCase();

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

  function renderExposure(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    content.innerHTML = `
      <div>
        <h2>${formOf(targetLang, targetConcept)}</h2>
        <p>${formOf(supportLang, targetConcept)}</p>
        <hr>
        <p>${tpl.render[targetLang]}</p>
        <p>${tpl.render[supportLang]}</p>
        <button id="continue-btn">Continue</button>
      </div>
    `;

    document.getElementById("continue-btn").onclick = () => {
      applyResult(targetConcept, true);
      renderNext(targetLang, supportLang);
    };
  }

  function renderComprehension(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    const role = meta.type === "pronoun" ? "pronoun"
               : meta.type === "verb" ? "verb"
               : "object";

    const q = tpl.questions[role];
    const options = shuffle([...q.choices]);

    content.innerHTML = `
      <div>
        <p>${tpl.render[targetLang]}</p>
        <p>${q.prompt[supportLang]}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = formOf(supportLang, opt);

      btn.onclick = () => {
        const correct = opt === q.answer;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function renderRecognition(targetLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const surface = tpl.surface?.[targetLang]?.[targetConcept];
    if (!surface) {
      renderComprehension(targetLang, targetLang, tpl, targetConcept);
      return;
    }

    const sentence = tpl.render[targetLang];
    const blanked = blankSentence(sentence, surface);

    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];

    const distractors = run.released.filter(cid => {
      if (cid === targetConcept) return false;
      const m = window.GLOBAL_VOCAB.concepts[cid];
      return m && m.type === meta.type;
    });

    if (distractors.length < 3) {
      renderComprehension(targetLang, targetLang, tpl, targetConcept);
      return;
    }

    const options = shuffle([targetConcept, ...distractors.slice(0,3)]);

    content.innerHTML = `
      <div>
        <p>${blanked}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = tpl.surface[targetLang][opt] || formOf(targetLang, opt);

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, targetLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function renderNext(targetLang, supportLang) {
    const tpl = chooseTemplate();
    if (!tpl) {
      content.innerHTML = "No eligible templates.";
      return;
    }

    const targetConcept = determineTargetConcept(tpl);
    const level = levelOf(targetConcept);

    if (level === 1) renderExposure(targetLang, supportLang, tpl, targetConcept);
    else if (level === 2) renderComprehension(targetLang, supportLang, tpl, targetConcept);
    else renderRecognition(targetLang, tpl, targetConcept);
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
