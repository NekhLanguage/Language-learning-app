// app.js — Scheduler-driven Exercise 5 (Option A)

const startScreen = document.getElementById("start-screen");
const learningScreen = document.getElementById("learning-screen");
const openAppBtn = document.getElementById("open-app");
const quitBtn = document.getElementById("quit-learning");
const loadBtn = document.getElementById("load");
const targetSel = document.getElementById("targetLang");
const supportSel = document.getElementById("supportLang");
const content = document.getElementById("content");
const subtitle = document.getElementById("session-subtitle");

// Safe user init
try {
  if (window.UserState?.ensureUser) {
    const u = window.UserState.ensureUser();
    window.__USER__ = u;
    window.__RUN__ = u.runs[u.current_run_id];
  }
} catch {}

// Navigation
openAppBtn.addEventListener("click", async () => {
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

// Load data
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
    fetch("nouns.json", { cache: "no-store" }).then(r => r.json()),
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
  subtitle.textContent = "Choose the missing word";
  content.innerHTML = "Loading...";

  const [templates, vocabIndex] = await Promise.all([
    loadTemplates(),
    loadVocabIndex()
  ]);

  // TEMP: seed Stage 1 exposure so Stage 2 can run
  const run = window.__RUN__;
  ["EAT", "FOOD"].forEach(cid => {
    run.concept_progress[cid] ??= {};
    run.concept_progress[cid].seen_stage1 ??= 3;
  });

  const d = Scheduler.getNextExercise(window.__RUN__, templates, vocabIndex);

  if (!d.template) {
    content.innerHTML = "Waiting for recall-ready concept.";
    return;
  }

  renderSlot(d.template, d.concept_id, targetSel.value, supportSel.value, vocabIndex);
}


// Slot exercise
function renderSlot(template, cid, targetLang, supportLang, vocabIndex) {
  const tgt = template.render[targetLang].split(" ");
  const sup = template.render[supportLang].split(" ");

  const verbT = tgt[1];
  const verbS = sup[1];
  const noun = tgt[2].replace(".", "");
  const pron = targetLang === "pt" ? "Ele/ela" : "He/she";

  content.innerHTML = `
    <div class="row">
      <div class="forms" style="font-size:1.4rem;margin:.25rem 0 .75rem;">
        ${pron} _____ ${noun}. (${verbS})
      </div>
      <div id="choices"></div>
    </div>
  `;

  const choices = document.getElementById("choices");
  const distractors = Object.keys(vocabIndex)
    .filter(c => vocabIndex[c].concept.type === "verb" && c !== cid)
    .slice(0, 3);

  const items = [
    { label: verbT, ok: true },
    ...distractors.map(c => ({
      label: vocabIndex[c].forms[targetLang]?.[0] || c,
      ok: false
    }))
  ].sort(() => Math.random() - 0.5);

  for (const it of items) {
    const b = document.createElement("button");
    b.className = "primary small";
    b.textContent = it.label;
    b.onclick = () => {
      b.textContent += it.ok ? " ✓" : " ✕";
      updateProgress(cid, it.ok);
    };
    choices.appendChild(b);
  }
}

function updateProgress(cid, ok) {
  const run = window.__RUN__;
  const p = run.concept_progress[cid] || { seen_stage1: 3, stage2_attempts: 0, stage2_correct: 0 };
  p.stage2_attempts++;
  if (ok) p.stage2_correct++;
  run.concept_progress[cid] = p;
  window.UserState?.saveUser?.(window.__USER__);
}
