// app.js — stable Exercise 5 + Exercise 6 baseline
// Deadlock-safe: prevents infinite scheduler loops

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

  openAppBtn.onclick = async () => {
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
    const res = await fetch("sentence_templates.json");
    const json = await res.json();
    return json.templates;
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

    // Exercise 6 — always valid
    if (decision.exercise_type === 6) {
      renderRetries = 0;
      renderMatch(decision.concept_ids, vocabIndex);
      return;
    }

    // Recall exercise without template → retry, but bounded
    if (!decision.template) {
      console.warn(
        "Invalid recall decision (no template):",
        decision.concept_id
      );

      renderRetries++;

      if (renderRetries >= MAX_RETRIES) {
        console.error(
          "Scheduler deadlock: no valid recall exercises available."
        );
        subtitle.textContent = "No valid exercises available";
        content.innerHTML =
          "<div class='forms'>You’ve completed all available recall items.</div>";
        return;
      }

      renderNext();
      return;
    }

    // Valid recall exercise
    renderRetries = 0;
    renderSlot(decision.template, decision.concept_id, vocabIndex);
  }

  function renderSlot(template, cid, vocabIndex) {
    subtitle.textContent = "Choose the missing word";

    const tgt = template.render[targetSel.value].split(" ");
    const sup = template.render[supportSel.value].split(" ");

    content.innerHTML = `
      <div class="forms">
        _____ ${tgt[2]} (${sup[1]})
      </div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    const verbs = Object.keys(vocabIndex)
      .filter(c => vocabIndex[c].concept.type === "verb");

    verbs.slice(0, 4).forEach(v => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[v].forms[targetSel.value][0];
      btn.onclick = () => {
        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage2_attempts = (p.stage2_attempts || 0) + 1;
        if (v === cid) p.stage2_correct = (p.stage2_correct || 0) + 1;
        window.__RUN__.concept_progress[cid] = p;
        window.UserState.saveUser(window.__USER__);
        renderNext();
      };
      choices.appendChild(btn);
    });
  }

  function renderMatch(conceptIds, vocabIndex) {
    subtitle.textContent = "Match the words";

    content.innerHTML = conceptIds.map(cid =>
      `<div>${vocabIndex[cid].forms[targetSel.value][0]} – ${vocabIndex[cid].forms[supportSel.value][0]}</div>`
    ).join("");
  }

});
