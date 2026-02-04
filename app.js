// app.js — FINAL
// Exercise 3 = Stage 1 comprehension
// Exercise 5 = Guided recall (with question + single hint + feedback)
// Exercise 6 = Matching

document.addEventListener("DOMContentLoaded", () => {

  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

  const u = window.UserState.ensureUser();
  window.__USER__ = u;
  window.__RUN__ = u.runs[u.current_run_id];

  async function loadTemplates() {
    return (await fetch("sentence_templates.json")).json().then(j => j.templates);
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

  async function renderNext() {
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
      return renderStage1(decision.template, decision.concept_id, vocabIndex);

    if (decision.exercise_type === 5)
      return renderExercise5(decision.template, decision.concept_id, vocabIndex);

    if (decision.exercise_type === 6)
      return renderMatch(decision.concept_ids, vocabIndex);
  }

  /* =========================
     Exercise 3 — Stage 1
     ========================= */
  function renderStage1(template, cid, vocabIndex) {
    subtitle.textContent = "Exercise 3";

    const q = template.questions[0];
    const tl = targetSel.value;
    const sl = supportSel.value;

    content.innerHTML = `
      <div class="forms">${template.render[tl]}</div>
      <div class="forms">${q.prompt[sl]}</div>
      <div id="choices"></div>
    `;

    q.choices.forEach(c => {
      const b = document.createElement("button");
      b.textContent = vocabIndex[c].forms[sl][0];
      b.onclick = () => {
        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage1_correct = (p.stage1_correct || 0) + (c === q.answer ? 1 : 0);
        window.__RUN__.concept_progress[cid] = p;
        renderNext();
      };
      choices.appendChild(b);
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
    const forms = vocabIndex[cid].forms[tl];

    for (const f of forms) {
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

    q.choices.forEach(opt => {
      const b = document.createElement("button");
      b.textContent = vocabIndex[opt].forms[tl][0];

      b.onclick = () => {
        const correct = opt === cid;
        [...choices.children].forEach(x => x.disabled = true);

        b.style.background = correct ? "#4caf50" : "#e57373";
        if (!correct) {
          [...choices.children].forEach(x => {
            if (x.textContent === vocabIndex[cid].forms[tl][0])
              x.style.background = "#4caf50";
          });
        }

        const p = window.__RUN__.concept_progress[cid] ?? {};
        p.stage2_attempts = (p.stage2_attempts || 0) + 1;
        if (correct) p.stage2_correct = (p.stage2_correct || 0) + 1;
        window.__RUN__.concept_progress[cid] = p;

        setTimeout(renderNext, correct ? 600 : 900);
      };

      choices.appendChild(b);
    });
  }

  /* =========================
     Exercise 6 — Matching
     ========================= */
  function renderMatch(ids, vocabIndex) {
    subtitle.textContent = "Exercise 6";
    content.innerHTML = "[Matching exercise placeholder]";
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  renderNext();
});
