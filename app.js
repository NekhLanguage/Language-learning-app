// app.js — stable Exercise 5 + Exercise 6
// Option A: temporary Stage-1 bridge

document.addEventListener("DOMContentLoaded", () => {

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const loadBtn = document.getElementById("load");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  // User init
  if (window.UserState?.ensureUser) {
    const u = window.UserState.ensureUser();
    window.__USER__ = u;
    window.__RUN__ = u.runs[u.current_run_id];
  }

  openAppBtn.onclick = async () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");
    await renderNext();
  };

  quitBtn.onclick = () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  };

  loadBtn.onclick = renderNext;

  async function loadTemplates() {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const json = await res.json();
    window.SENTENCE_TEMPLATES = json.templates || json;
    return window.SENTENCE_TEMPLATES;
  }

  async function loadVocabIndex() {
    const packs = await Promise.all([
      fetch("verbs.json").then(r => r.json()),
      fetch("pronouns.json").then(r => r.json()),
      fetch("nouns.json").then(r => r.json())
    ]);

    const index = {};
    for (const pack of packs) {
      for (const c of pack.concepts || []) {
        index[c.concept_id] = { concept: c, forms: {} };
      }
      for (const [lang, langPack] of Object.entries(pack.languages || {})) {
        for (const [cid, forms] of Object.entries(langPack.forms || {})) {
          index[cid].forms[lang] = forms;
        }
      }
    }

    window.VOCAB_INDEX = index;
    return index;
  }

  async function renderNext() {
    subtitle.textContent = "Loading…";
    content.innerHTML = "Loading…";

    const run = window.__RUN__;

    const [templates, vocabIndex] = await Promise.all([
      loadTemplates(),
      loadVocabIndex()
    ]);

   Object.keys(vocabIndex).forEach(cid => {
  run.concept_progress[cid] ??= {};

  // Stage 1 exposure bridge
  if (run.concept_progress[cid].seen_stage1 == null) {
    run.concept_progress[cid].seen_stage1 = 3;
  }

  // Stage 2 entry bridge (only once)
  if (run.concept_progress[cid].stage2_attempts == null) {
    run.concept_progress[cid].stage2_attempts = 1;
    run.concept_progress[cid].stage2_correct = 0;
  }
});


    const decision = Scheduler.getNextExercise(run, templates, vocabIndex);

    if (decision.exercise_type === 6) {
      renderMatch(decision.concept_ids, targetSel.value, supportSel.value, vocabIndex);
      return;
    }

    if (decision.exercise_type === 5 && decision.template) {
      renderSlot(decision.template, decision.concept_id, targetSel.value, supportSel.value, vocabIndex, run);
      return;
    }

    content.innerHTML = "Waiting for recall-ready concept.";
  }

  function renderSlot(template, cid, targetLang, supportLang, vocabIndex, run) {
    subtitle.textContent = "Choose the missing word";

    const tgt = template.render[targetLang].split(" ");
    const sup = template.render[supportLang].split(" ");

    const verbTarget = tgt[1];
    const verbSupport = sup[1];
    const noun = tgt[2].replace(".", "");
    const pronoun = targetLang === "pt" ? "Ele/ela" : "He/she";

    content.innerHTML = `
      <div class="row">
        <div class="forms">${pronoun} _____ ${noun}. (${verbSupport})</div>
        <div id="choices"></div>
      </div>
    `;

    const choices = document.getElementById("choices");

    const distractors = Object.keys(vocabIndex)
      .filter(c => vocabIndex[c].concept.type === "verb" && c !== cid)
      .slice(0, 3);

    const items = [
      { label: verbTarget, ok: true },
      ...distractors.map(c => ({
        label: vocabIndex[c].forms[targetLang][0],
        ok: false
      }))
    ].sort(() => Math.random() - 0.5);

    for (const it of items) {
      const btn = document.createElement("button");
      btn.textContent = it.label;
      btn.onclick = () => {
        if (it.ok) {
          run.concept_progress[cid].stage2_correct =
            (run.concept_progress[cid].stage2_correct || 0) + 1;
        }
        run.concept_progress[cid].stage2_attempts =
          (run.concept_progress[cid].stage2_attempts || 0) + 1;

        window.UserState?.saveUser?.(window.__USER__);
        renderNext();
      };
      choices.appendChild(btn);
    }
  }

  function renderMatch(conceptIds, targetLang, supportLang, vocabIndex) {
    subtitle.textContent = "Match the words";

    const pairs = conceptIds.map(cid => ({
      cid,
      target: vocabIndex[cid].forms[targetLang][0],
      support: vocabIndex[cid].forms[supportLang][0]
    }));

    const left = [...pairs].sort(() => Math.random() - 0.5);
    const right = [...pairs].sort(() => Math.random() - 0.5);

    content.innerHTML = `
      <div class="row match-grid">
        <div id="match-left"></div>
        <div id="match-right"></div>
      </div>
    `;

    const leftCol = document.getElementById("match-left");
    const rightCol = document.getElementById("match-right");

    let selected = null;

    left.forEach(item => {
      const b = document.createElement("button");
      b.textContent = item.target;
      b.onclick = () => selected = item;
      leftCol.appendChild(b);
    });

    right.forEach(item => {
      const b = document.createElement("button");
      b.textContent = item.support;
      b.onclick = () => {
        if (selected && selected.cid === item.cid) {
          b.textContent += " ✓";
        }
      };
      rightCol.appendChild(b);
    });
  }

});
