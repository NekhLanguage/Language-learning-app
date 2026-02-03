// app.js — Stage 1 + Stage 2 stable
// Exercise 3 = sentence comprehension
// Exercise 5 = guided recall (select correct word, ONE support hint)
// Exercise 6 = matching

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
      renderStage1(decision.template, decision.concept_id, vocabIndex);
      return;
    }

    if (decision.exercise_type === 6) {
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

  // ============================
  // Exercise 3 — Stage 1
  // ============================
  function renderStage1(template, cid, vocabIndex) {
    subtitle.textContent = "Understand the sentence";

    const targetLang = targetSel.value;
    const supportLang = supportSel.value;
    const q = template.questions[0];

    content.innerHTML = `
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
      btn.textContent =
        vocabIndex[choiceCid].forms[supportLang][0];

      btn.onclick = () => {
        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage1_seen = (p.stage1_seen || 0) + 1;

        if (choiceCid === q.answer) {
          p.stage1_correct = (p.stage1_correct || 0) + 1;
        }

        window.__RUN__.concept_progress[cid] = p;
        window.UserState.saveUser(window.__USER__);
        renderNext();
      };

      choicesDiv.appendChild(btn);
    });
  }

  // ============================
  // Exercise 5 — Guided recall (FIXED)
  // ============================
  function renderSlot(template, cid, vocabIndex) {
    subtitle.textContent = "Choose the missing word";

    const targetLang = targetSel.value;
    const supportLang = supportSel.value;

    const targetSentence = template.render?.[targetLang] || "";
    const missingForms = vocabIndex[cid]?.forms?.[targetLang] || [];

    let maskedSentence = targetSentence;
    let replaced = false;

    // Case-insensitive replacement of the correct surface form
    for (const form of missingForms) {
      if (!form) continue;
      const escaped = escapeRegex(form);
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(maskedSentence)) {
        maskedSentence = maskedSentence.replace(re, "_____");
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      console.warn("Could not blank concept in sentence:", cid, targetSentence);
    }

    // 🔒 ONE support-language hint only
    const supportForms = vocabIndex[cid]?.forms?.[supportLang] || [];
    const supportHint = supportForms[0] || "";

    content.innerHTML = `
      <div class="forms" style="font-size:1.2rem;margin-bottom:0.75rem;">
        ${escapeHtml(maskedSentence)}
      </div>
      <div class="forms" style="opacity:0.85;margin-bottom:0.75rem;">
        (${escapeHtml(supportHint)})
      </div>
      <div id="choices"></div>
    `;

    const choicesDiv = document.getElementById("choices");

    // Use template-defined semantic constraints if available
    const q = template.questions?.[0];
    const optionIds = q?.choices?.length
      ? q.choices
      : shuffle([cid]);

    optionIds.forEach(optId => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[optId].forms[targetLang][0];

      btn.onclick = () => {
        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage2_attempts = (p.stage2_attempts || 0) + 1;
        if (optId === cid) {
          p.stage2_correct = (p.stage2_correct || 0) + 1;
        }
        window.__RUN__.concept_progress[cid] = p;
        window.UserState.saveUser(window.__USER__);
        renderNext();
      };

      choicesDiv.appendChild(btn);
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

    const left = shuffle([...pairs]);
    const right = shuffle([...pairs]);

    let solved = 0;

    content.innerHTML = `
      <div style="display:flex;gap:3rem;justify-content:center;">
        <div id="left"></div>
        <div id="right"></div>
      </div>
    `;

    const leftDiv = document.getElementById("left");
    const rightDiv = document.getElementById("right");

    left.forEach(item => {
      const el = document.createElement("div");
      el.textContent = item.target;
      el.draggable = true;
      el.dataset.id = item.id;
      el.style.cursor = "grab";
      el.style.margin = "0.5rem";
      el.style.padding = "0.6rem 1rem";
      el.style.border = "2px solid rgba(255,255,255,0.5)";
      el.ondragstart = e =>
        e.dataTransfer.setData("text/plain", item.id);
      leftDiv.appendChild(el);
    });

    right.forEach(item => {
      const el = document.createElement("div");
      el.textContent = item.support;
      el.dataset.id = item.id;
      el.style.margin = "0.5rem";
      el.style.padding = "0.6rem 1rem";
      el.style.border = "2px dashed rgba(255,255,255,0.4)";
      el.ondragover = e => e.preventDefault();
      el.ondrop = e => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId === item.id) {
          el.textContent = "✓ " + el.textContent;
          solved++;
          if (solved === pairs.length) {
            setTimeout(renderNext, 600);
          }
        }
      };
      rightDiv.appendChild(el);
    });
  }

  // --------------------
  // Helpers
  // --------------------
  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

});
