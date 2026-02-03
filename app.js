// app.js — Scheduler-driven Exercise 5
// TEMP Stage-1 + recall seeding
// FIXED: wrapped in DOMContentLoaded so execution is guaranteed

document.addEventListener("DOMContentLoaded", () => {
  console.log("APP BOOTSTRAP STARTED");

  // --------------------
  // DOM refs
  // --------------------
  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const loadBtn = document.getElementById("load");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  // --------------------
  // Safe user init
  // --------------------
  try {
    if (window.UserState?.ensureUser) {
      const u = window.UserState.ensureUser();
      window.__USER__ = u;
      window.__RUN__ = u.runs[u.current_run_id];
      console.log("USER INITIALIZED", window.__RUN__);
    }
  } catch (e) {
    console.warn("User init failed", e);
  }

  // --------------------
  // Navigation
  // --------------------
  openAppBtn.addEventListener("click", async () => {
    console.log("OPEN APP CLICKED");
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");
    await renderNext();
  });

  quitBtn.addEventListener("click", () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  });

  loadBtn.addEventListener("click", async () => {
    await renderNext();
  });

  // --------------------
  // Data loaders
  // --------------------
  async function loadTemplates() {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const json = await res.json();
    window.SENTENCE_TEMPLATES = json.templates || json;
    return window.SENTENCE_TEMPLATES;
  }

  async function loadVocabIndex() {
    const packs = await Promise.all([
      fetch("verbs.json", { cache: "no-store" }).then(r => r.json()),
      fetch("pronouns.json", { cache: "no-store" }).then(r => r.json()),
      fetch("nouns.json", { cache: "no-store" }).then(r => r.json())
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

  // --------------------
  // MAIN LOOP
  // --------------------
  async function renderNext() {
    console.log("RENDER NEXT RUNNING");

    subtitle.textContent = "Choose the missing word";
    content.innerHTML = "Loading...";

    const [templates, vocabIndex] = await Promise.all([
      loadTemplates(),
      loadVocabIndex()
    ]);

    
    console.log("SEEDED PROGRESS:", JSON.stringify(run.concept_progress));

    const decision = Scheduler.getNextExercise(
      run,
      templates,
      vocabIndex
    );

    console.log("SCHEDULER DECISION:", decision);

    if (!decision.template) {
      content.innerHTML = "Waiting for recall-ready concept.";
      return;
    }

    renderSlot(
      decision.template,
      decision.concept_id,
      targetSel.value,
      supportSel.value,
      vocabIndex
    );
  }

  // --------------------
  // Exercise 5 renderer
  // --------------------
  function renderSlot(template, cid, targetLang, supportLang, vocabIndex) {
    const tgt = template.render[targetLang].split(" ");
    const sup = template.render[supportLang].split(" ");

    const verbTarget = tgt[1];
    const verbSupport = sup[1];
    const noun = tgt[2].replace(".", "");
    const pronoun = targetLang === "pt" ? "Ele/ela" : "He/she";

    content.innerHTML = `
      <div class="row">
        <div class="forms" style="font-size:1.4rem;margin:.25rem 0 .75rem;">
          ${pronoun} _____ ${noun}. (${verbSupport})
        </div>
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
        label: vocabIndex[c].forms[targetLang]?.[0] || c,
        ok: false
      }))
    ].sort(() => Math.random() - 0.5);

    for (const it of items) {
      const btn = document.createElement("button");
      btn.className = "primary small";
      btn.textContent = it.label;
      btn.onclick = () => {
        btn.textContent += it.ok ? " ✓" : " ✕";
        updateProgress(cid, it.ok);
      };
      choices.appendChild(btn);
    }
  }

  // --------------------
  // Progress update
  // --------------------
  function updateProgress(cid, correct) {
    const run = window.__RUN__;
    const p = run.concept_progress[cid] || {
      seen_stage1: 3,
      stage2_attempts: 0,
      stage2_correct: 0
    };

    p.stage2_attempts++;
    if (correct) p.stage2_correct++;

    run.concept_progress[cid] = p;
    window.UserState?.saveUser?.(window.__USER__);
  }
});
