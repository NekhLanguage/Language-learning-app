// app.js — Stage 1 + Stage 2
// VERSION: v0.10.0-ex4
// Exercise 3, 4, 5, 6 implemented

document.addEventListener("DOMContentLoaded", () => {

  const VERSION = "v0.10.0-ex4";

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");

  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div style="position:fixed;bottom:4px;right:6px;font-size:10px;opacity:0.5;">${VERSION}</div>`
  );

  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  openAppBtn.onclick = () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");
    renderNext();
  };

  quitBtn.onclick = () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  };

  async function loadTemplates() {
    return (await fetch("sentence_templates.json", { cache: "no-store" }).then(r => r.json())).templates;
  }

  async function loadVocab() {
    const packs = await Promise.all([
      fetch("verbs.json").then(r => r.json()),
      fetch("pronouns.json").then(r => r.json()),
      fetch("nouns.json").then(r => r.json())
    ]);

    const index = {};
    for (const pack of packs) {
      for (const c of pack.concepts) index[c.concept_id] = { concept: c, forms: {} };
      for (const [lang, lp] of Object.entries(pack.languages)) {
        for (const [cid, forms] of Object.entries(lp.forms)) {
          if (index[cid]) index[cid].forms[lang] = forms;
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

    const d = Scheduler.getNextExercise(window.__RUN__, templates, vocabIndex);

    if (d.exercise_type === 3) return renderExercise3(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 4) return renderExercise4(d.concept_id, vocabIndex);
    if (d.exercise_type === 5) return renderExercise5(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 6) return renderExercise6(d.concept_ids, vocabIndex);

    content.innerHTML = "<div class='forms'>No valid exercise</div>";
  }

  /* =========================
     Exercise 4 — Click word
     ========================= */
  function renderExercise4(cid, vocabIndex) {
    subtitle.textContent = "Exercise 4";

    const tl = targetSel.value;
    const sl = supportSel.value;
    const correct = vocabIndex[cid];

    const pool = Object.keys(vocabIndex)
      .filter(x =>
        x !== cid &&
        vocabIndex[x].concept.type === correct.concept.type
      )
      .slice(0, 3);

    const options = shuffle([cid, ...pool]);

    content.innerHTML = `
      <div class="forms">(${vocabIndex[cid].forms[sl][0]})</div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[tl][0];

      btn.onclick = () => {
        const isCorrect = opt === cid;
        [...choices.children].forEach(b => b.disabled = true);

        btn.style.background = isCorrect ? "#4caf50" : "#e57373";
        if (!isCorrect) {
          [...choices.children].forEach(b => {
            if (b.textContent === vocabIndex[cid].forms[tl][0])
              b.style.background = "#4caf50";
          });
        }

        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage1_correct = (p.stage1_correct || 0) + (isCorrect ? 1 : 0);
        window.__RUN__.concept_progress[cid] = p;

        setTimeout(renderNext, isCorrect ? 600 : 900);
      };

      choices.appendChild(btn);
    });
  }

  /* =========================
     Exercise 3 / 5 / 6
     (unchanged from before)
     ========================= */

  // (Exercise 3, 5, 6 code stays exactly as in your current working version)

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

});
