
// Zero to Hero – Blueprint Engine
// VERSION: v0.9.5-blueprint-engine

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.5-blueprint-engine";

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");

  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");

  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  function mustHave(el) { return !!el; }

  console.log("App version:", APP_VERSION);

  // ---------------- GLOBAL MERGE ----------------

  const VOCAB_FILES = [
    "adjectives.json",
    "connectors.json",
    "directions_positions.json",
    "glue_words.json",
    "nouns.json",
    "numbers.json",
    "politeness_modality.json",
    "pronouns.json",
    "quantifiers.json",
    "question_words.json",
    "time_words.json",
    "verbs.json"
  ];

  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

  async function loadAndMergeVocab() {
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

    console.log("GLOBAL_VOCAB ready");
  }

  // ---------------- RUN STATE ----------------

  let run = null;

  function initializeRun() {
    const allConceptIds = Object.keys(window.GLOBAL_VOCAB.concepts);

    run = {
      released: [],
      future: [...allConceptIds],
      progress: {},
      lastExercise: null
    };

    releaseNextConcepts(5);
  }

  function releaseNextConcepts(n) {
    for (let i = 0; i < n && run.future.length > 0; i++) {
      const cid = run.future.shift();
      run.released.push(cid);
      run.progress[cid] = { level: 1, streak: 0 };
    }
  }

  // ---------------- SCHEDULER ----------------
let TEMPLATE_CACHE = null;

async function loadTemplates() {
  if (!TEMPLATE_CACHE) {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const data = await res.json();
    TEMPLATE_CACHE = data.templates || [];
  }
  return TEMPLATE_CACHE;
}

function hasTemplateForConcept(cid) {
  if (!TEMPLATE_CACHE) return false;
  return TEMPLATE_CACHE.some(t =>
    (t.concepts || []).includes(cid)
  );
}

function selectNextConcept() {
  const validConcepts = run.released.filter(cid =>
    hasTemplateForConcept(cid)
  );

  if (validConcepts.length === 0) {
    console.warn("No concepts have matching templates.");
    return null;
  }

  const sorted = validConcepts.sort((a, b) =>
    run.progress[a].level - run.progress[b].level
  );

  return sorted[0];
}

  function selectExerciseForConcept(cid) {
    return run.progress[cid].level;
  }

  function schedule() {
    const cid = selectNextConcept();
    const exercise = selectExerciseForConcept(cid);

    run.lastExercise = exercise;
    return { cid, exercise };
  }

  // ---------------- ADVANCEMENT ----------------

  function handleResult(cid, correct) {
    const state = run.progress[cid];

    if (correct) {
      state.streak++;
      if (state.streak >= 2) {
        state.level++;
        state.streak = 0;

        if (state.level === 3) {
          releaseNextConcepts(1);
        }
      }
    } else {
      state.streak = 0;
    }
  }

  // ---------------- RENDER ----------------

async function renderNext(targetLang, supportLang) {
  await loadTemplates();

  const result = schedule();
  if (!result) {
    content.innerHTML = "No available exercises yet.";
    return;
  }

  const { cid, exercise } = result;

  if (exercise <= 3) {
    await renderComprehension(targetLang, supportLang, cid);
  } else {
    content.innerHTML = `<div>Exercise ${exercise} not yet implemented.</div>`;
  }
}

  async function renderComprehension(targetLang, supportLang, targetConcept) {
    subtitle.textContent = `Exercise (Level ${run.progress[targetConcept].level}) • ${APP_VERSION}`;
    content.innerHTML = "Loading...";

    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const data = await res.json();

    const tpl = data.templates.find(t =>
      (t.concepts || []).includes(targetConcept)
    );

    if (!tpl) {
      content.innerHTML = "No matching template.";
      return;
    }

    const sentence = tpl.render[targetLang];
    const allPronouns = Object.entries(window.GLOBAL_VOCAB.concepts)
      .filter(([_, c]) => c.type === "pronoun")
      .map(([id]) => id);

    const correct = targetConcept;

    const distractors = allPronouns
      .filter(id => id !== correct)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const options = [correct, ...distractors]
      .sort(() => Math.random() - 0.5);

    content.innerHTML = `
      <div>
        <p>${sentence}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.onclick = () => {
        const isCorrect = opt === correct;
        handleResult(targetConcept, isCorrect);
        renderNext(targetLang, supportLang);
      };
      choicesDiv.appendChild(btn);
    });
  }

  // ---------------- ENTRY ----------------

  if (openAppBtn && startScreen && learningScreen) {
    openAppBtn.addEventListener("click", async () => {
      startScreen.classList.remove("active");
      learningScreen.classList.add("active");

      const tl = targetSel?.value || "pt";
      const sl = supportSel?.value || "en";

      await loadAndMergeVocab();
      initializeRun();
      renderNext(tl, sl);
    });
  }

  if (quitBtn && startScreen && learningScreen) {
    quitBtn.addEventListener("click", () => {
      learningScreen.classList.remove("active");
      startScreen.classList.add("active");
    });
  }

});
