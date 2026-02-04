// app.js — DEBUG VERSION
// TEMP: exercise numbering enabled for clarity
// REMOVE numbering once behavior is confirmed

document.addEventListener("DOMContentLoaded", () => {

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  let renderRetries = 0;
  const MAX_RETRIES = 5;

  openAppBtn.onclick = () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");
    renderRetries = 0;
    renderNext();
  };

  quitBtn.onclick = () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  };

  async function loadTemplates() {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    return (await res.json()).templates;
  }

  async function loadVocab() {
    const packs = await Promise.all([
      fetch("verbs.json").then(r => r.json()),
      fetch("pronouns.json").then(r => r.json()),
      fetch("nouns.json").then(r => r.json())
    ]);

    const index = {};
    for (const pack of packs) {
      for (const c of pack.concepts) {
        index[c.concept_id] = { concept: c, forms: {} };
      }
      for (const [lang, langPack] of Object.entries(pack.languages)) {
        for (const [cid, forms] of Object.entries(langPack.forms)) {
          if (!index[cid]) continue;
          index[cid].forms[lang] = forms;
        }
      }
    }
    return index;
  }

  async function renderNext() {
    subtitle.textContent = "Loading…";
    content.innerHTML = "Loading…";

    const [templates, vocabIndex] = await Promise.all([
      loadTemplates(),
      loadVocab()
    ]);

    const decision = Scheduler.getNextExercise(
      window.__RUN__,
      templates,
      vocabIndex
    );

    if (decision.exercise_type === 3) {
      renderExerciseHeader(3, "Stage 1 – Comprehension");
      renderStage1(decision.template, decision.concept_id, vocabIndex);
      return;
    }

    if (decision.exercise_type === 5) {
      renderExerciseHeader(5, "Stage 2 – Guided Recall");
      renderSlot(decision.template, decision.concept_id, vocabIndex);
      return;
    }

    if (decision.exercise_type === 6) {
      renderExerciseHeader(6, "Stage 2 – Matching");
      renderMatch(decision.concept_ids, vocabIndex);
      return;
    }

    console.error("Unknown exercise type:", decision);
    content.innerHTML = "<div class='forms'>⚠ Unknown exercise</div>";
  }

  // --------------------
  // Exercise header (TEMP)
  // --------------------
  function renderExerciseHeader(num, label) {
    subtitle.textContent = `Exercise ${num}`;
    content.innerHTML = `
      <div class="forms" style="opacity:0.6;margin-bottom:0.5rem;">
        [Exercise ${num} – ${label}]
      </div>
    `;
  }

  // ============================
  // Exercise 3 — Stage 1
  // ============================
  function renderStage1(template, cid, vocabIndex) {
    const targetLang = targetSel.value;
    const supportLang = supportSel.value;
    const q = template.questions[0];

    content.innerHTML += `
      <div class="forms" style="font-size:1.2rem;margin-bottom:1rem;">
        ${template.render[targetLang]}
      </div>
      <div class="forms" style="margin-bottom:0.75rem;">
        ${q.prompt[supportLang]}
      </div>
      <div id="choices"></div>
    `;

    const choicesDiv = document.getElementById("choices");

    q.choices.forEach(choiceCid => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[choiceCid].forms[supportLang][0];
      btn.onclick = () => renderNext();
      choicesDiv.appendChild(btn);
    });
  }

  // ============================
  // Exercise 5 — Guided Recall
  // ============================
  function renderSlot(template, cid, vocabIndex) {
    const targetLang = targetSel.value;
    const supportLang = supportSel.value;
    const q = template.questions?.[0];

    let sentence = template.render[targetLang];
    const forms = vocabIndex[cid]?.forms?.[targetLang] || [];

    for (const f of forms) {
      const re = new RegExp(`\\b${escapeRegex(f)}\\b`, "i");
      if (re.test(sentence)) {
        sentence = sentence.replace(re, "_____");
        break;
      }
    }

    content.innerHTML += `
      <div class="forms" style="font-size:1.2rem;margin-bottom:0.75rem;">
        ${sentence}
      </div>
      <div class="forms" style="margin-bottom:0.75rem;">
        ${q?.prompt?.[supportLang] || "⚠ Missing question"}
      </div>
      <div id="choices"></div>
    `;

    const choicesDiv = document.getElementById("choices");

    q.choices.forEach(optId => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[optId].forms[targetLang][0];
      btn.onclick = () => renderNext();
      choicesDiv.appendChild(btn);
    });
  }

  // ============================
  // Exercise 6 — Matching
  // ============================
  function renderMatch(conceptIds, vocabIndex) {
    content.innerHTML += `
      <div class="forms">[Matching exercise placeholder]</div>
    `;
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

});
