// Zero to Hero – data-driven learning app (Stage 1 enabled)
// NOTE: Stage 1 remains locked/correct.
// This version adds:
// - VOCAB_INDEX exposure (already present)
// - Exercise 5 (guided recall, slot-based)
// - TEMP test hook to force Exercise 5 (bypasses scheduler intentionally)

// --------------------
// User + run bootstrap (localStorage)
// --------------------
try {
  if (window.UserState && typeof window.UserState.ensureUser === 'function') {
    const __user = window.UserState.ensureUser();
    const __run = __user.runs[__user.current_run_id];
    window.__USER__ = __user;
    window.__RUN__ = __run;
    console.log('[UserState] Loaded user:', __user.user_id);
    console.log('[UserState] Current run:', __run.run_id, __run.target_language, __run.support_language);
  } else {
    console.warn('[UserState] user_state.js not loaded; running without persistence.');
  }
} catch (e) {
  console.warn('[UserState] Failed to init user state; running without persistence.', e);
}

// --------------------
// DOM references
// --------------------
const startScreen = document.getElementById("start-screen");
const learningScreen = document.getElementById("learning-screen");

const openAppBtn = document.getElementById("open-app");
const quitBtn = document.getElementById("quit-learning");

const datasetSel = document.getElementById("dataset");
const targetSel = document.getElementById("targetLang");
const supportSel = document.getElementById("supportLang");
const loadBtn = document.getElementById("load");

const content = document.getElementById("content");
const subtitle = document.getElementById("session-subtitle");

// --------------------
// External links
// --------------------
document.getElementById("link-blueprint").href = "#";
document.getElementById("link-skool").href = "#";
document.getElementById("link-coaching").href = "#";

// --------------------
// App entry / exit
// --------------------
openAppBtn.addEventListener("click", async () => {
  startScreen.classList.remove("active");
  learningScreen.classList.add("active");

  await ensureVocabIndex();
  await loadStage1Comprehension(targetSel.value, supportSel.value);

  // --------------------
  // TEMP: Force Exercise 5 for verification
  // This bypasses the scheduler on purpose.
  // Remove this block once Exercise 5 is wired to Scheduler.
  // --------------------
  if (window.SENTENCE_TEMPLATES?.templates?.length) {
    const tpl = window.SENTENCE_TEMPLATES.templates[0];
    // Heuristic: slot the verb (usually index 1)
    const targetConceptId = tpl.concepts[1];
    renderExercise5({
      template: tpl,
      targetConceptId,
      targetLang: targetSel.value,
      supportLang: supportSel.value
    });
  }
});

quitBtn.addEventListener("click", () => {
  learningScreen.classList.remove("active");
  startScreen.classList.add("active");
});

// --------------------
// Dataset viewer (dev / later use)
// --------------------
loadBtn.addEventListener("click", () => {
  console.warn("Vocab dataset viewer is disabled. Learning is scheduler-driven.");
});

// --------------------
// VOCAB INDEX (SAFE, READ-ONLY)
// --------------------
async function ensureVocabIndex() {
  if (window.VOCAB_INDEX) return;

  const vocabFiles = [
    "pronouns.json",
    "verbs.json",
    "nouns.json",
    "adjectives.json",
    "numbers.json",
    "time_words.json",
    "directions_positions.json",
    "quantifiers.json",
    "connectors.json",
    "question_words.json",
    "politeness_modality.json",
    "glue_words.json"
  ];

  const index = {};

  for (const file of vocabFiles) {
    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      for (const concept of data.concepts || []) {
        index[concept.concept_id] = concept;
      }
    } catch (e) {
      console.warn("[Vocab] Failed loading", file);
    }
  }

  window.VOCAB_INDEX = index;
  console.log("[Vocab] VOCAB_INDEX ready:", Object.keys(index).length);
}

// --------------------
// Stage 1 – Sentence comprehension (UNCHANGED)
// --------------------
async function loadStage1Comprehension(targetLang, supportLang) {
  subtitle.textContent = "Read and understand";
  content.innerHTML = "Loading sentence...";

  let data;
  try {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    window.SENTENCE_TEMPLATES = data;
  } catch (e) {
    content.innerHTML = "Could not load sentence templates.";
    return;
  }

  const tpl = data.templates[0];
  const sentence = tpl.render[targetLang];
  const questionText = buildWhoQuestionFromSupportSentence(tpl, supportLang);

  content.innerHTML = `
    <div class="row">
      <strong>Read and understand</strong>
      <div class="forms" style="font-size:1.2rem;margin:0.5rem 0 0.75rem;">
        ${escapeHtml(sentence)}
      </div>
      <div class="forms" style="margin-bottom:0.5rem;">
        ${escapeHtml(questionText)}
      </div>
      <div id="choices"></div>
    </div>
  `;

  const choicesDiv = document.getElementById("choices");

  tpl.questions[0].choices.forEach(conceptId => {
    const btn = document.createElement("button");
    btn.className = "primary small";
    btn.style.marginRight = "0.5rem";
    btn.textContent = pronounLabel(conceptId, supportLang);

    btn.onclick = () => {
      btn.textContent += conceptId === "THIRD_PERSON_SINGULAR" ? " ✓" : " ✕";
    };

    choicesDiv.appendChild(btn);
  });
}

// --------------------
// Exercise 5 – Guided recall (slot-based, NO typing)
// --------------------
function renderExercise5({ template, targetConceptId, targetLang, supportLang }) {
  subtitle.textContent = "Choose the missing word";
  content.innerHTML = "";

  const fullSentence = template.render[targetLang];

  // Mask by replacing the surface form corresponding to the target concept.
  // NOTE: We assume single surface form per concept at this stage.
  const surface = getConceptSurface(targetConceptId, targetLang);
  const maskedSentence = surface
    ? fullSentence.replace(surface, "___")
    : fullSentence.replace(/\S+/, "___");

  const wrapper = document.createElement("div");
  wrapper.className = "row";
  wrapper.innerHTML = `
    <div class="forms" style="font-size:1.2rem;margin-bottom:0.75rem;">
      ${escapeHtml(maskedSentence)}
    </div>
    <div id="exercise5-choices"></div>
  `;

  content.appendChild(wrapper);

  const choicesDiv = document.getElementById("exercise5-choices");

  const choices = buildExercise5Choices(targetConceptId, targetLang);
  shuffleArray(choices);

  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "primary small";
    btn.style.marginRight = "0.5rem";
    btn.textContent = choice.label;

    btn.onclick = () => {
      recordExercise5Result(targetConceptId, choice.concept_id === targetConceptId);
      btn.textContent += choice.concept_id === targetConceptId ? " ✓" : " ✕";
    };

    choicesDiv.appendChild(btn);
  });
}

function buildExercise5Choices(targetConceptId, lang) {
  const out = [];

  // Correct
  out.push({
    concept_id: targetConceptId,
    label: getConceptSurface(targetConceptId, lang) || targetConceptId
  });

  // Distractors: simple, introduced concepts only (v1)
  const distractors = Object.keys(window.VOCAB_INDEX || {})
    .filter(cid => cid !== targetConceptId)
    .slice(0, 3);

  distractors.forEach(cid => {
    out.push({
      concept_id: cid,
      label: getConceptSurface(cid, lang) || cid
    });
  });

  return out;
}

function recordExercise5Result(conceptId, correct) {
  const run = window.__RUN__;
  if (!run.concept_progress[conceptId]) {
    run.concept_progress[conceptId] = {
      seen_stage1: 3,
      stage2_attempts: 0,
      stage2_correct: 0
    };
  }
  run.concept_progress[conceptId].stage2_attempts += 1;
  if (correct) run.concept_progress[conceptId].stage2_correct += 1;
  window.UserState?.saveUser(window.__USER__);
}

// --------------------
// Helpers (existing + small additions)
// --------------------
function getConceptSurface(conceptId, lang) {
  // Minimal surface resolver: relies on sentence templates already using correct forms.
  // For vocab-driven surfaces, this will be expanded later.
  // For now, return null to allow safe fallback.
  return null;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildWhoQuestionFromSupportSentence(tpl, supportLang) {
  const supportSentence = tpl.render?.[supportLang];
  if (!supportSentence) return "Who?";

  switch (supportLang) {
    case "en": return whoFromSvoSentence(supportSentence, "Who");
    case "pt": return whoFromSvoSentence(supportSentence, "Quem");
    case "ja": return whoFromJapaneseSentence(supportSentence);
    default:   return whoFromSvoSentence(supportSentence, "Who");
  }
}

function whoFromSvoSentence(sentence, whoWord) {
  let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return `${whoWord}?`;
  parts[0] = whoWord;
  return `${parts.join(" ")}?`;
}

function whoFromJapaneseSentence(sentence) {
  let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");
  const idxWa = clean.indexOf("は");
  const idxGa = clean.indexOf("が");
  let cutIdx = Math.min(
    idxWa !== -1 ? idxWa : Infinity,
    idxGa !== -1 ? idxGa : Infinity
  );
  if (cutIdx !== Infinity) clean = clean.slice(cutIdx + 1).trim();
  return `誰が${clean}？`;
}

function pronounLabel(conceptId, lang) {
  const map = {
    FIRST_PERSON_SINGULAR: { en: "I", pt: "eu", ja: "私" },
    SECOND_PERSON: { en: "you", pt: "você", ja: "あなた" },
    THIRD_PERSON_SINGULAR: { en: "he / she", pt: "ele / ela", ja: "彼 / 彼女" }
  };
  return map[conceptId]?.[lang] || conceptId;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
