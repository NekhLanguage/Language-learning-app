// app.js — Progression rules + forward leakage enforcement
// VERSION: v0.14.0-progression-rules

document.addEventListener("DOMContentLoaded", () => {

  const VERSION = "v0.14.0-progression-rules";

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
    `<div style="position:fixed;bottom:4px;right:6px;font-size:10px;opacity:0.5;z-index:9999;">
      ${VERSION}
    </div>`
  );

  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  // --------------------
  // Run scaffolding
  // --------------------
  if (!window.__RUN__.concept_progress) window.__RUN__.concept_progress = {};
  if (!window.__RUN__.history) window.__RUN__.history = [];
  if (!window.__RUN__.step_counter) window.__RUN__.step_counter = 0;

  function ensureProgress(cid) {
    if (!window.__RUN__.concept_progress[cid]) {
      window.__RUN__.concept_progress[cid] = {
        current_exercise_level: 1,
        exercise_streaks: {}
      };
    }
    const p = window.__RUN__.concept_progress[cid];
    if (p.current_exercise_level === undefined) p.current_exercise_level = 1;
    if (!p.exercise_streaks) p.exercise_streaks = {};
    return p;
  }

  function logHistory(exercise_type, concept_id, result) {
    window.__RUN__.step_counter += 1;
    window.__RUN__.history.push({
      step: window.__RUN__.step_counter,
      exercise_type,
      concept_id,
      result
    });
    window.UserState.saveUser(window.__USER__);
  }

  // Forward leakage guard: only allow concepts that have reached the exercise level.
  function conceptsAtOrAboveLevel(vocabIndex, minLevel) {
    return Object.keys(vocabIndex).filter(cid => {
      const p = ensureProgress(cid);
      return (p.current_exercise_level ?? 1) >= minLevel;
    });
  }

  // --------------------
  // App entry / exit
  // --------------------
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
    // NOTE: Keep this list explicit for now. Scaling later can move this into a manifest.
    const packs = await Promise.all([
      fetch("verbs.json").then(r => r.json()),
      fetch("pronouns.json").then(r => r.json()),
      fetch("nouns.json").then(r => r.json()),
      fetch("connectors.json").then(r => r.json()),
      fetch("numbers.json").then(r => r.json()),
      fetch("question_words.json").then(r => r.json()),
      fetch("time_words.json").then(r => r.json()),
      fetch("directions_positions.json").then(r => r.json()),
      fetch("quantifiers.json").then(r => r.json()),
      fetch("politeness_modality.json").then(r => r.json()),
      fetch("glue_words.json").then(r => r.json()),
      fetch("adjectives.json").then(r => r.json())
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

    // Ensure progress objects exist for all known concepts (so scaling is safe).
    for (const cid of Object.keys(vocabIndex)) ensureProgress(cid);

    const d = Scheduler.getNextExercise(window.__RUN__, templates, vocabIndex);

    if (d.exercise_type === 1) return renderExercise1(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 3) return renderExercise3(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 4) return renderExercise4(d.concept_id, vocabIndex);
    if (d.exercise_type === 5) return renderExercise5(d.template, d.concept_id, vocabIndex);
    if (d.exercise_type === 6) return renderExercise6(d.concept_ids, vocabIndex);

    content.innerHTML = "<div class='forms'>No valid exercise</div>";
  }

  // --------------------
  // Progression rules
  // --------------------
  function advanceLevelIfReady(cid, exercise_type) {
    const p = ensureProgress(cid);
    const streak = p.exercise_streaks[exercise_type] || 0;

    // Two correct in a row gates advancement (Exercises 3+).
    if (streak >= 2) {
      if (exercise_type === 3 && p.current_exercise_level < 4) p.current_exercise_level = 4;
      else if (exercise_type === 4 && p.current_exercise_level < 5) p.current_exercise_level = 5;
      else if (exercise_type === 5 && p.current_exercise_level < 6) p.current_exercise_level = 6;
    }
  }

  function recordResult(cid, exercise_type, result) {
    const p = ensureProgress(cid);

    if (result === "correct") {
      p.exercise_streaks[exercise_type] = (p.exercise_streaks[exercise_type] || 0) + 1;
    } else if (result === "incorrect") {
      p.exercise_streaks[exercise_type] = 0;
    }

    logHistory(exercise_type, cid, result);
    advanceLevelIfReady(cid, exercise_type);
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
      // Exposure -> level 3 (immediate).
      const p = ensureProgress(cid);
      if ((p.current_exercise_level ?? 1) < 3) p.current_exercise_level = 3;

      // Still log so cooldown/no-repeat works.
      logHistory(1, cid, "correct");
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

    const q = template.questions?.[0] || {};
    const answerCid = q.answer || cid; // back-compat
    const prompt = q.prompt?.[sl] || "Choose the correct answer.";

    // Forward leakage: choices must be eligible for ex3.
    const eligible = new Set(conceptsAtOrAboveLevel(vocabIndex, 3));
    let choices = Array.isArray(q.choices) ? q.choices.filter(x => eligible.has(x)) : [];
    if (!choices.includes(answerCid)) choices.push(answerCid);
    choices = choices.slice(0, 4);

    content.innerHTML = `
      <div class="forms">${template.render[tl]}</div>
      <div class="forms">${prompt}</div>
      <div id="choices"></div>
    `;

    const choicesEl = document.getElementById("choices");

    choices.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt]?.forms?.[sl]?.[0] || opt;

      btn.onclick = () => {
        const ok = opt === answerCid;

        [...choicesEl.children].forEach(b => b.disabled = true);
        btn.classList.add(ok ? "correct" : "incorrect");

        if (!ok) {
          [...choicesEl.children].forEach(b => {
            if (b.textContent === (vocabIndex[answerCid]?.forms?.[sl]?.[0] || answerCid)) {
              b.classList.add("correct");
            }
          });
        }

        recordResult(answerCid, 3, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 800 : 1000);
      };

      choicesEl.appendChild(btn);
    });
  }

  /* =========================
     Exercise 4 — Click Word
     ========================= */
  function renderExercise4(cid, vocabIndex) {
    subtitle.textContent = "Exercise 4";

    const tl = targetSel.value;
    const sl = supportSel.value;
    const correct = vocabIndex[cid];

    const eligible = new Set(conceptsAtOrAboveLevel(vocabIndex, 4));
    const pool = Object.keys(vocabIndex)
      .filter(x => x !== cid)
      .filter(x => eligible.has(x))
      .filter(x => vocabIndex[x].concept.type === correct.concept.type)
      .slice(0, 3);

    const options = pool.concat(cid).sort(() => Math.random() - 0.5);

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

        [...choices.children].forEach(b => b.disabled = true);
        btn.classList.add(ok ? "correct" : "incorrect");

        if (!ok) {
          [...choices.children].forEach(b => {
            if (b.textContent === correct.forms[tl][0]) {
              b.classList.add("correct");
            }
          });
        }

        recordResult(cid, 4, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 800 : 1000);
      };

      choices.appendChild(btn);
    });
  }

  /* =========================
     Exercise 5 — Guided Recall
     ========================= */
  function renderExercise5(template, cid, vocabIndex) {
    subtitle.textContent = "Exercise 5";

    const tl = targetSel.value;
    const sl = supportSel.value;

    const q = template.questions?.[0] || {};

    let sentence = template.render[tl];
    for (const f of vocabIndex[cid].forms[tl]) {
      const re = new RegExp(`\\b${escapeRegExp(f)}\\b`, "i");
      if (re.test(sentence)) {
        sentence = sentence.replace(re, "_____");
        break;
      }
    }

    content.innerHTML = `
      <div class="forms">${sentence}</div>
      <div class="forms">${q.prompt?.[sl] || "Choose the missing word."}</div>
      <div class="forms">(${vocabIndex[cid].forms[sl][0]})</div>
      <div id="choices"></div>
    `;

    const choicesEl = document.getElementById("choices");

    const eligible = new Set(conceptsAtOrAboveLevel(vocabIndex, 5));
    let choices = (Array.isArray(q.choices) ? q.choices : []).filter(x => eligible.has(x));
    if (!choices.includes(cid)) choices.push(cid);

    if (choices.length < 4) {
      const extra = Object.keys(vocabIndex)
        .filter(x => x !== cid)
        .filter(x => eligible.has(x))
        .slice(0, 4 - choices.length);
      choices.push(...extra);
    }

    choices = [...new Set(choices)].slice(0, 6).sort(() => Math.random() - 0.5);

    choices.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[tl][0];

      btn.onclick = () => {
        const ok = opt === cid;

        [...choicesEl.children].forEach(b => b.disabled = true);
        btn.classList.add(ok ? "correct" : "incorrect");

        if (!ok) {
          [...choicesEl.children].forEach(b => {
            if (b.textContent === vocabIndex[cid].forms[tl][0]) {
              b.classList.add("correct");
            }
          });
        }

        recordResult(cid, 5, ok ? "correct" : "incorrect");
        setTimeout(renderNext, ok ? 800 : 1000);
      };

      choicesEl.appendChild(btn);
    });
  }

  /* =========================
     Exercise 6 — Matching (placeholder)
     ========================= */
  function renderExercise6(ids, vocabIndex) {
    subtitle.textContent = "Exercise 6";
    content.innerHTML = "<div class='forms'>Matching...</div>";
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  }

});
