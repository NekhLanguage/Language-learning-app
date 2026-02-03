// app.js — stable Exercise 5 + Exercise 6
// Exercise 6 = active matching (target ↔ support)

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

    // Exercise 6 — matching
    if (decision.exercise_type === 6) {
      renderRetries = 0;
      renderMatch(decision.concept_ids, vocabIndex);
      return;
    }

    // Recall exercise must have template
    if (!decision.template) {
      console.warn(
        "Invalid recall decision (no template):",
        decision.concept_id
      );
      renderRetries++;
      if (renderRetries >= MAX_RETRIES) {
        subtitle.textContent = "No valid exercises available";
        content.innerHTML =
          "<div class='forms'>You’ve completed all available recall items.</div>";
        return;
      }
      renderNext();
      return;
    }

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

  // ============================
  // Exercise 6 — Active Matching
  // ============================
  function renderMatch(conceptIds, vocabIndex) {
    subtitle.textContent = "Match the words";

    const targetLang = targetSel.value;
    const supportLang = supportSel.value;

    const pairs = conceptIds.map(cid => ({
      id: cid,
      target: vocabIndex[cid].forms[targetLang][0],
      support: vocabIndex[cid].forms[supportLang][0]
    }));

    const shuffle = arr => arr.sort(() => Math.random() - 0.5);

    const left = shuffle([...pairs]);
    const right = shuffle([...pairs]);

    let selectedLeft = null;
    const solved = new Set();

    content.innerHTML = `
      <div style="display:flex;gap:2rem;justify-content:center;">
        <div id="left"></div>
        <div id="right"></div>
      </div>
    `;

    const leftDiv = document.getElementById("left");
    const rightDiv = document.getElementById("right");

    left.forEach(item => {
      const btn = document.createElement("button");
      btn.textContent = item.target;
      btn.onclick = () => {
        selectedLeft = item;
        [...leftDiv.children].forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      leftDiv.appendChild(btn);
    });

    right.forEach(item => {
      const btn = document.createElement("button");
      btn.textContent = item.support;
      btn.onclick = () => {
        if (!selectedLeft) return;

        if (item.id === selectedLeft.id) {
          solved.add(item.id);
          btn.disabled = true;

          [...leftDiv.children].forEach(b => {
            if (b.textContent === selectedLeft.target) {
              b.disabled = true;
              b.classList.remove("selected");
            }
          });

          selectedLeft = null;

          if (solved.size === pairs.length) {
            setTimeout(renderNext, 400);
          }
        } else {
          btn.classList.add("wrong");
          setTimeout(() => btn.classList.remove("wrong"), 300);
        }
      };
      rightDiv.appendChild(btn);
    });
  }

});
