// app.js — stable Exercise 5 + Exercise 6
// Exercise 6 = desktop drag + mobile tap matching (5 items)

document.addEventListener("DOMContentLoaded", () => {

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  const isTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

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
    return (await fetch("sentence_templates.json").then(r => r.json())).templates;
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

    if (decision.exercise_type === 6) {
      renderRetries = 0;
      renderMatch(decision.concept_ids, vocabIndex);
      return;
    }

    if (!decision.template) {
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
  // Exercise 6 — Matching
  // ============================
  function renderMatch(conceptIds, vocabIndex) {
    subtitle.textContent = "Match the words";

    const pairs = conceptIds.slice(0, 5).map(cid => ({
      id: cid,
      target: vocabIndex[cid].forms[targetSel.value][0],
      support: vocabIndex[cid].forms[supportSel.value][0]
    }));

    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    const left = shuffle([...pairs]);
    const right = shuffle([...pairs]);

    let selected = null;
    let solved = 0;

    content.innerHTML = `
      <div style="display:flex;gap:2rem;justify-content:center;">
        <div id="left"></div>
        <div id="right"></div>
      </div>
      <p class="forms" style="opacity:0.8;text-align:center;margin-top:1rem;">
        ${isTouch ? "Tap a word, then tap its meaning" : "Drag the word to its meaning"}
      </p>
    `;

    const leftDiv = document.getElementById("left");
    const rightDiv = document.getElementById("right");

    left.forEach(item => {
      const el = document.createElement("div");
      el.textContent = item.target;
      el.dataset.id = item.id;
      el.className = "match-left";
      el.style.padding = "0.6rem 1rem";
      el.style.margin = "0.4rem";
      el.style.border = "2px solid rgba(255,255,255,0.5)";
      el.style.borderRadius = "12px";
      el.style.textAlign = "center";
      el.style.cursor = "pointer";

      if (!isTouch) {
        el.draggable = true;
        el.ondragstart = e =>
          e.dataTransfer.setData("text/plain", item.id);
      }

      el.onclick = () => {
        if (!isTouch) return;
        selected = item.id;
        [...leftDiv.children].forEach(c => c.style.opacity = "1");
        el.style.opacity = "0.5";
      };

      leftDiv.appendChild(el);
    });

    right.forEach(item => {
      const el = document.createElement("div");
      el.textContent = item.support;
      el.dataset.id = item.id;
      el.style.padding = "0.6rem 1rem";
      el.style.margin = "0.4rem";
      el.style.border = "2px dashed rgba(255,255,255,0.4)";
      el.style.borderRadius = "12px";
      el.style.textAlign = "center";

      const checkMatch = draggedId => {
        if (draggedId === item.id) {
          el.textContent = "✓ " + el.textContent;
          el.style.background = "#4caf50";
          el.style.borderStyle = "solid";
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
          checkMatch(e.dataTransfer.getData("text/plain"));
        };
      } else {
        el.onclick = () => {
          if (!selected) return;
          checkMatch(selected);
          selected = null;
          [...leftDiv.children].forEach(c => c.style.opacity = "1");
        };
      }

      rightDiv.appendChild(el);
    });
  }

});
