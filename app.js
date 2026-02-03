// app.js — stable Exercise 5 + Exercise 6
// Defensive against missing sentence templates

document.addEventListener("DOMContentLoaded", () => {

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const loadBtn = document.getElementById("load");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  // --------------------
  // User init
  // --------------------
  const user = window.UserState.ensureUser();
  const run = user.runs[user.current_run_id];
  window.__USER__ = user;
  window.__RUN__ = run;

  // --------------------
  // Navigation
  // --------------------
  openAppBtn.onclick = async () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");
    renderNext();
  };

  quitBtn.onclick = () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  };

  loadBtn.onclick = renderNext;

  // --------------------
  // Data loaders
  // --------------------
  async function loadTemplates() {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const json = await res.json();
    return json.templates || json;
  }

  async function loadVocabIndex() {
    const packs = await Promise.all([
      fetch("verbs.json").then(r => r.json()),
      fetch("pronouns.json").then(r => r.json()),
      fetch("nouns.json").then(r => r.json())
    ]);

    const index = {};
    for (const pack of packs) {
      for (const c of pack.concepts || []) {
        index[c.concept_id] = { concept: c, forms: {} };
      }
      for (const [lang, langPack] of Object.entries(pack.languages || {})) {
        for (const [cid, forms] of Object.entries(langPack.forms || {})) {
          index[cid].forms[lang] = forms;
        }
      }
    }

    window.VOCAB_INDEX = index;
    return index;
  }

  // --------------------
  // Main render loop
  // --------------------
  async function renderNext() {
    subtitle.textContent = "Loading…";
    content.innerHTML = "Loading…";

    const [templates, vocabIndex] = await Promise.all([
      loadTemplates(),
      loadVocabIndex()
    ]);

    // ---- TEMP Stage-1 bridge (until Stage-1 exists) ----
    Object.keys(vocabIndex).forEach(cid => {
      run.concept_progress[cid] ??= {};
      if (run.concept_progress[cid].seen_stage1 == null) {
        run.concept_progress[cid].seen_stage1 = 3;
      }
      if (run.concept_progress[cid].stage2_attempts == null) {
        run.concept_progress[cid].stage2_attempts = 1;
        run.concept_progress[cid].stage2_correct = 0;
      }
    });

    const decision = Scheduler.getNextExercise(run, templates, vocabIndex);

    // ---------- Exercise 6 ----------
    if (decision.exercise_type === 6) {
      renderMatch(decision.concept_ids, targetSel.value, supportSel.value, vocabIndex);
      return;
    }

    // ---------- Exercise 5 ----------
    if (decision.exercise_type === 5) {
      if (!decision.template) {
        // Clean, honest skip — no sentence exists yet
        console.warn("No sentence template for concept:", decision.concept_id);
        renderNext();
        return;
      }

      renderSlot(
        decision.template,
        decision.concept_id,
        targetSel.value,
        supportSel.value,
        vocabIndex
      );
      return;
    }

    content.innerHTML = "Waiting for recall-ready concept.";
  }

  // --------------------
  // Exercise 5 — guided recall
  // --------------------
  function renderSlot(template, cid, targetLang, supportLang, vocabIndex) {
    subtitle.textContent = "Choose the missing word";

    const tgt = template.render[targetLang].split(" ");
    const sup = template.render[supportLang].split(" ");

    const verbTarget = tgt[1];
    const verbSupport = sup[1];
    const noun = tgt[2].replace(".", "");
    const pronoun = targetLang === "pt" ? "Ele/ela" : "He/she";

    content.innerHTML = `
      <div class="row">
        <div class="forms">
          ${pronoun} _____ ${noun}. (${verbSupport})
        </div>
        <div id="choices"></div>
      </div>
    `;

    const choices = document.getElementById("choices");

    const verbs = Object.keys(vocabIndex)
      .filter(c => vocabIndex[c].concept.type === "verb");

    verbs.slice(0, 4).forEach(v => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[v].forms[targetLang][0];
      btn.onclick = () => {
        const p = run.concept_progress[cid];
        p.stage2_attempts++;
        if (v === cid) p.stage2_correct++;
        window.UserState.saveUser(user);
        renderNext();
      };
      choices.appendChild(btn);
    });
  }

  // --------------------
  // Exercise 6 — matching
  // --------------------
  function renderMatch(conceptIds, targetLang, supportLang, vocabIndex) {
    subtitle.textContent = "Match the words";

    content.innerHTML = conceptIds.map(cid =>
      `<div>${vocabIndex[cid].forms[targetLang][0]} – ${vocabIndex[cid].forms[supportLang][0]}</div>`
    ).join("");
  }

});
