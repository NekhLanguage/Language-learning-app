// Zero to Hero – Template-Driven Blueprint Engine
// VERSION: v0.9.9-template-seeded-stable

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.9-template-seeded-stable";

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  console.log("Running:", APP_VERSION);
  document.title = (document.title || "Zero-to-Hero") + " • " + APP_VERSION;

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

  function initRunFromTemplates() {
    const allTemplateConcepts = [
      ...new Set(TEMPLATE_CACHE.flatMap(t => t.concepts || []))
    ];

    run = {
      released: [],
      future: [...allTemplateConcepts],
      progress: {},
      lastTemplateId: null
    };

    seedWithFirstTemplate();
  }

  function seedWithFirstTemplate() {
    if (!TEMPLATE_CACHE.length) return;

    const firstTemplateConcepts = TEMPLATE_CACHE[0].concepts || [];

    for (const cid of firstTemplateConcepts) {
      run.released.push(cid);
      ensureProgress(cid);
    }

    run.future = run.future.filter(cid => !firstTemplateConcepts.includes(cid));
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

  function chooseTemplate() {
    const eligible = TEMPLATE_CACHE.filter(templateEligible);
    if (!eligible.length) return null;

    let best = eligible[0];
    let bestMin = Infinity;

    for (const tpl of eligible) {
      const minLevel = Math.min(...tpl.concepts.map(levelOf));
      if (minLevel < bestMin) {
        bestMin = minLevel;
        best = tpl;
      }
    }

    return best;
  }

  function determineTargetConcept(tpl) {
    let lowest = tpl.concepts[0];
    let lowestLevel = levelOf(lowest);

    for (const cid of tpl.concepts) {
      const lvl = levelOf(cid);
      if (lvl < lowestLevel) {
        lowestLevel = lvl;
        lowest = cid;
      }
    }

    return lowest;
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);

    if (!correct) {
      state.streak = 0;
      return;
    }

    state.streak++;
    if (state.streak >= 2) {
      state.level++;
      state.streak = 0;

      if (state.level === 3) {
        releaseConcepts(1);
      }
    }
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

  async function renderNext(targetLang, supportLang) {
    const tpl = chooseTemplate();

    if (!tpl) {
      subtitle.textContent = "No available templates • " + APP_VERSION;
      content.innerHTML = "No eligible templates yet.";
      return;
    }

    run.lastTemplateId = tpl.template_id;
    const targetConcept = determineTargetConcept(tpl);

    subtitle.textContent = "Level " + levelOf(targetConcept) + " • " + APP_VERSION;

    const sentence = tpl.render[targetLang];
    const correctAnswer = tpl.questions?.[0]?.answer;
    const options = shuffle([...tpl.questions[0].choices]);

    content.innerHTML = `
      <div>
        <p>${sentence}</p>
        <p>${tpl.questions[0].prompt[supportLang]}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = formOf(supportLang, opt);

      btn.onclick = () => {
        const correct = opt === correctAnswer;
        applyResult(targetConcept, correct);
        renderNext(targetLang, supportLang);
      };

      choicesDiv.appendChild(btn);
    });
  }

  openAppBtn?.addEventListener("click", async () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");

    const tl = targetSel?.value || "pt";
    const sl = supportSel?.value || "en";

    await loadAndMergeVocab();
    await loadTemplates();
    initRunFromTemplates();
    renderNext(tl, sl);
  });

  quitBtn?.addEventListener("click", () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  });

});
