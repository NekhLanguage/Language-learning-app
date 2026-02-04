// app.js — STABLE + INTERACTIVE
// VERSION: v0.9.0-ex6-interactive
// Exercise 3 = Stage 1 comprehension
// Exercise 5 = Guided recall (blank + question + single hint + feedback)
// Exercise 6 = Interactive matching (desktop drag + mobile tap)

document.addEventListener("DOMContentLoaded", () => {

  const VERSION = "v0.9.0-ex6-interactive";

  // --------------------
  // DOM
  // --------------------
  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");

  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  const isTouch =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // --------------------
  // Version stamp (visible)
  // --------------------
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div style="
      position:fixed;
      bottom:4px;
      right:6px;
      font-size:10px;
      opacity:0.5;
      z-index:9999;
    ">${VERSION}</div>`
  );

  console.log("APP LOADED:", VERSION);

  // --------------------
  // User state
  // --------------------
  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  // --------------------
  // Entry / Exit
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

  // --------------------
  // Loaders
  // --------------------
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
      for (const [lang, lp] of Object.entries(pack.languages)) {
        for (const [cid, forms] of Object.entries(lp.forms)) {
          if (index[cid]) index[cid].forms[lang] = forms;
        }
      }
    }
    return index;
  }

  // --------------------
  // Main loop
  // --------------------
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

    if (decision.exercise_type === 3)
      return renderExercise3(decision.template, decision.concept_id, vocabIndex);

    if (decision.exercise_type === 5)
      return renderExercise5(decision.template, decision.concept_id, vocabIndex);

    if (decision.exercise_type === 6)
      return renderExercise6(decision.concept_ids, vocabIndex);

    content.innerHTML = "<div class='forms'>No valid exercise.</div>";
  }

  /* =========================
     Exercise 3 — Stage 1
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
        const p = window.__RUN__.concept_progress[cid] ?? {};
        if (opt === q.answer) {
          p.stage1_correct = (p.stage1_correct || 0) + 1;
        }
        window.__RUN__.concept_progress[cid] = p;
        renderNext();
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
    const q = template.questions[0];

    let sentence = template.render[tl];
    for (const f of vocabIndex[cid].forms[tl]) {
      const re = new RegExp(`\\b${escapeRegex(f)}\\b`, "i");
      if (re.test(sentence)) {
        sentence = sentence.replace(re, "_____");
        break;
      }
    }

    const hint = vocabIndex[cid].forms[sl][0];

    content.innerHTML = `
      <div class="forms">${sentence}</div>
      <div class="forms">${q.prompt[sl]}</div>
      <div class="forms">(${hint})</div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    q.choices.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[opt].forms[tl][0];

      btn.onclick = () => {
        const correct = opt === cid;
        [...choices.children].forEach(b => b.disabled = true);

        btn.style.background = correct ? "#4caf50" : "#e57373";
        if (!correct) {
          [...choices.children].forEach(b => {
            if (b.textContent === vocabIndex[cid].forms[tl][0]) {
              b.style.background = "#4caf50";
            }
          });
        }

        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage2_attempts = (p.stage2_attempts || 0) + 1;
        if (correct) p.stage2_correct = (p.stage2_correct || 0) + 1;
        window.__RUN__.concept_progress[cid] = p;

        setTimeout(renderNext, correct ? 600 : 900);
      };

      choices.appendChild(btn);
    });
  }

  /* =========================
     Exercise 6 — Matching (interactive)
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

    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    const left = shuffle([...pairs]);
    const right = shuffle([...pairs]);

    let selected = null;
    let solved = 0;

    content.innerHTML = `
      <div class="forms">
        ${isTouch ? "Tap a word, then tap its meaning" : "Drag the word to its meaning"}
      </div>
      <div style="display:flex;gap:2rem;">
        <div id="left"></div>
        <div id="right"></div>
      </div>
    `;

    const leftDiv = document.getElementById("left");
    const rightDiv = document.getElementById("right");

    left.forEach(item => {
      const el = document.createElement("button");
      el.textContent = item.left;
      el.dataset.id = item.id;

      if (!isTouch) {
        el.draggable = true;
        el.ondragstart = e => e.dataTransfer.setData("text/plain", item.id);
      }

      el.onclick = () => {
        if (!isTouch) return;
        selected = item.id;
        [...leftDiv.children].forEach(b => b.style.opacity = "1");
        el.style.opacity = "0.5";
      };

      leftDiv.appendChild(el);
    });

    right.forEach(item => {
      const el = document.createElement("button");
      el.textContent = item.right;
      el.dataset.id = item.id;

      const check = draggedId => {
        if (draggedId === item.id) {
          el.style.background = "#4caf50";
          el.disabled = true;
          solved++;
          if (solved === pairs.length) {
            setTimeout(renderNext, 600);
          }
        } else {
          el.style.background = "#e57373";
          setTimeout(() => el.style.background = "", 300);
        }
      };

      if (!isTouch) {
        el.ondragover = e => e.preventDefault();
        el.ondrop = e => {
          e.preventDefault();
          check(e.dataTransfer.getData("text/plain"));
        };
      } else {
        el.onclick = () => {
          if (!selected) return;
          check(selected);
          selected = null;
          [...leftDiv.children].forEach(b => b.style.opacity = "1");
        };
      }

      rightDiv.appendChild(el);
    });
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

});
