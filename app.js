// app.js — stable Exercise 5 + Exercise 6
// FIX: Exercise 5 blanks the correct concept word (not the first token)
// and options come from the same concept type as the tested concept.

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

    if (decision.exercise_type === 6) {
      renderRetries = 0;
      renderMatch(decision.concept_ids, vocabIndex);
      return;
    }

    // Exercise 5 (guided recall selection)
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
  // Exercise 5 — Guided recall (select correct word)
  // ============================
  function renderSlot(template, cid, vocabIndex) {
    subtitle.textContent = "Choose the missing word";

    const targetLang = targetSel.value;
    const supportLang = supportSel.value;

    const targetSentence = template.render?.[targetLang] || "";
    const supportHint = (vocabIndex[cid]?.forms?.[supportLang]?.[0]) || cid;

    const missingForms = vocabIndex[cid]?.forms?.[targetLang] || [];
    const missingType = vocabIndex[cid]?.concept?.type || null;

    // Replace the FIRST occurrence of any known target form with a blank.
    // If we can't find it (e.g., conjugation mismatch), we show blank + sentence as fallback.
    let maskedSentence = targetSentence;
    let replaced = false;

    for (const form of missingForms) {
      if (!form) continue;
      const escaped = escapeRegex(form);
      const re = new RegExp(`\\b${escaped}\\b`);
      if (re.test(maskedSentence)) {
        maskedSentence = maskedSentence.replace(re, "_____");
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // Fallback: put blank at the front to avoid misleading “wrong word blanked”
      maskedSentence = `_____ ${targetSentence}`;
    }

    content.innerHTML = `
      <div class="forms" style="font-size:1.2rem;margin-bottom:0.75rem;">
        ${escapeHtml(maskedSentence)}
      </div>
      <div class="forms" style="opacity:0.85;margin-bottom:0.75rem;">
        (${escapeHtml(supportHint)})
      </div>
      <div id="choices"></div>
    `;

    const choices = document.getElementById("choices");

    // Build options from same concept type as cid (verbs with verbs, pronouns with pronouns, etc.)
    // Ensure each option has a target form.
    const pool = Object.keys(vocabIndex).filter(xid => {
      if (xid === cid) return false;
      const meta = vocabIndex[xid]?.concept;
      const forms = vocabIndex[xid]?.forms?.[targetLang];
      if (!meta || !forms || !forms[0]) return false;
      return missingType ? meta.type === missingType : true;
    });

    // Pick 3 distractors + correct answer = 4 options total
    const distractors = shuffle(pool).slice(0, 3);
    const optionIds = shuffle([cid, ...distractors]);

    optionIds.forEach(optId => {
      const btn = document.createElement("button");
      btn.textContent = vocabIndex[optId].forms[targetLang][0];

      btn.onclick = () => {
        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage2_attempts = (p.stage2_attempts || 0) + 1;
        if (optId === cid) p.stage2_correct = (p.stage2_correct || 0) + 1;
        window.__RUN__.concept_progress[cid] = p;
        window.UserState.saveUser(window.__USER__);
        renderNext();
      };

      choices.appendChild(btn);
    });
  }

  // ============================
  // Exercise 6 — Drag & Drop Match (5 items)
  // ============================
  function renderMatch(conceptIds, vocabIndex) {
    subtitle.textContent = "Match the words";

    const targetLang = targetSel.value;
    const supportLang = supportSel.value;

    const pairs = conceptIds.slice(0, 5).map(cid => ({
      id: cid,
      target: vocabIndex[cid].forms[targetLang][0],
      support: vocabIndex[cid].forms[supportLang][0]
    }));

    const left = shuffle([...pairs]);
    const right = shuffle([...pairs]);

    let solved = 0;

    content.innerHTML = `
      <div style="display:flex;gap:3rem;justify-content:center;">
        <div id="left" style="min-width:200px;"></div>
        <div id="right" style="min-width:200px;"></div>
      </div>
      <p class="forms" style="margin-top:1rem;opacity:0.8;text-align:center;">
        Drag the words on the left to their meanings on the right
      </p>
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
      el.style.borderRadius = "12px";
      el.style.textAlign = "center";
      el.style.background = "rgba(255,255,255,0.08)";

      el.ondragstart = e => {
        el.style.opacity = "0.5";
        e.dataTransfer.setData("text/plain", item.id);
      };

      el.ondragend = () => {
        el.style.opacity = "1";
      };

      leftDiv.appendChild(el);
    });

    right.forEach(item => {
      const el = document.createElement("div");
      el.textContent = item.support;
      el.dataset.id = item.id;

      el.style.margin = "0.5rem";
      el.style.padding = "0.6rem 1rem";
      el.style.border = "2px dashed rgba(255,255,255,0.4)";
      el.style.borderRadius = "12px";
      el.style.textAlign = "center";
      el.style.background = "rgba(255,255,255,0.04)";
      el.style.transition = "background 0.2s, border-color 0.2s";

      el.ondragover = e => {
        e.preventDefault();
        el.style.borderColor = "#ffffff";
        el.style.background = "rgba(255,255,255,0.12)";
      };

      el.ondragleave = () => {
        el.style.borderColor = "rgba(255,255,255,0.4)";
        el.style.background = "rgba(255,255,255,0.04)";
      };

      el.ondrop = e => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");

        el.style.borderColor = "rgba(255,255,255,0.4)";
        el.style.background = "rgba(255,255,255,0.04)";

        if (draggedId === item.id) {
          el.style.background = "#4caf50";
          el.style.borderStyle = "solid";
          el.textContent = "✓ " + el.textContent;
          el.ondrop = null;

          const dragged = [...leftDiv.children].find(c => c.dataset.id === draggedId);
          dragged.style.visibility = "hidden";

          solved++;
          if (solved === pairs.length) {
            setTimeout(renderNext, 600);
          }
        } else {
          el.style.background = "#e57373";
          setTimeout(() => {
            el.style.background = "rgba(255,255,255,0.04)";
          }, 300);
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
