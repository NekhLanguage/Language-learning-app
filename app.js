// app.js — Step 1+2 memory recording
// VERSION: v0.12.0-memory-step12

document.addEventListener("DOMContentLoaded", () => {

  const VERSION = "v0.12.0-memory-step12";

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
    `<div style="position:fixed;bottom:4px;right:6px;font-size:10px;opacity:0.5;">
      ${VERSION}
    </div>`
  );

  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  // --- STEP 1: initialize memory ---
  if (window.__RUN__.step_counter === undefined) window.__RUN__.step_counter = 0;
  if (!Array.isArray(window.__RUN__.history)) window.__RUN__.history = [];

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

    if (d.exercise_type === 1) return renderExercise1(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 3) return renderExercise3(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 4) return renderExercise4(d.concept_id, vocabIndex);
    if (d.exercise_type === 5) return renderExercise5(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 6) return renderExercise6(d.concept_ids, vocabIndex);

    content.innerHTML = "<div class='forms'>No valid exercise</div>";
  }

  // --- helper to record result ---
  function recordResult(concept_id, exercise_type, result) {
    const run = window.__RUN__;
    run.step_counter++;

    run.history.push({
      step: run.step_counter,
      concept_id,
      exercise_type,
      result
    });

    const p = run.concept_progress[concept_id] ?? {};
    if (!p.exercise_streaks) p.exercise_streaks = {};

    if (result === "correct") {
      p.exercise_streaks[exercise_type] =
        (p.exercise_streaks[exercise_type] || 0) + 1;
    } else if (result === "incorrect") {
      p.exercise_streaks[exercise_type] = 0;
    }

    run.concept_progress[concept_id] = p;
  }

  /* =========================
     Exercise 1 — Exposure
     ========================= */
  function renderExercise1(template, cid, vocabIndex) {
    subtitle.textContent = "Exercise 1";

    const tl = targetSel.value;
    const sl = supportSel.value;

    content.innerHTML = `
      <div class="forms">${vocabIndex[cid].forms[tl][0]}</div>
      <div class="forms">(${vocabIndex[cid].forms[sl][0]})</div>
      <div class="forms">${template.render[tl]}</div>
      <button id="continue">Continue</button>
    `;

    document.getElementById("continue").onclick = () => {
      recordResult(cid, 1, "neutral");
      renderNext();
    };
  }

  /* =========================
     Exercise 3 — Comprehension
     ========================= */
  function renderExercise3(template, cid, vocabIndex) {
    subtitle.textContent = "Exercise 3";

    const tl = targetSel.value;
    const sl = supportSel.value;
    const q = template.questions[0];

    content.innerHTML = `
      <div class="forms">${template.render[tl]}</div>
      <div class="forms">${q.prompt[sl]}</div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    q.choices.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[sl][0];

      btn.onclick = () => {
        const ok = opt === q.answer;
        recordResult(cid, 3, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 600 : 900);
      };

      choices.appendChild(btn);
    });
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
      .filter(x => x !== cid && vocabIndex[x].concept.type === correct.concept.type)
      .slice(0, 3);

    const options = shuffle([cid, ...pool]);

    content.innerHTML = `
      <div class="forms">(${correct.forms[sl][0]})</div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[tl][0];

      btn.onclick = () => {
        const ok = opt === cid;
        recordResult(cid, 4, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 600 : 900);
      };

      choices.appendChild(btn);
    });
  }

  /* =========================
     Exercise 5 — Guided recall
     ========================= */
  function renderExercise5(template, cid, vocabIndex) {
    subtitle.textContent = "Exercise 5";

    const tl = targetSel.value;
    const sl = supportSel.value;
    const q = template.questions[0];

    let sentence = template.render[tl];
    for (const f of vocabIndex[cid].forms[tl]) {
      const re = new RegExp(`\\b${escapeRegex(f)}\\b`, "i");
      if (re.test(sentence)) {
        sentence = sentence.replace(re, "_____");
        break;
      }
    }

    content.innerHTML = `
      <div class="forms">${sentence}</div>
      <div class="forms">${q.prompt[sl]}</div>
      <div class="forms">(${vocabIndex[cid].forms[sl][0]})</div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    q.choices.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[tl][0];

      btn.onclick = () => {
        const ok = opt === cid;
        recordResult(cid, 5, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 600 : 900);
      };

      choices.appendChild(btn);
    });
  }

  /* =========================
     Exercise 6 — Matching
     ========================= */
  function renderExercise6(ids, vocabIndex) {
    subtitle.textContent = "Exercise 6";

    const tl = targetSel.value;
    const sl = supportSel.value;

    const pairs = ids.map(cid => ({
      id: cid,
      left: vocabIndex[cid].forms[tl][0],
      right: vocabIndex[cid].forms[sl][0]
    }));

    content.innerHTML = `
      <div class="forms">Match the words</div>
      <button id="continue">Continue</button>
    `;

    document.getElementById("continue").onclick = () => {
      recordResult(ids[0], 6, "neutral");
      renderNext();
    };
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

});
