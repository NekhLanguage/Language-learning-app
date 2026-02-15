<<<<<<< Updated upstream
<<<<<<< Updated upstream
// ==============================
// Utility Helpers
// ==============================

function getConceptLevel(run, cid) {
  return run.concept_progress[cid]?.current_exercise_level ?? 1;
}

function ensureConceptInitialized(run, cid) {
  if (!run.concept_progress[cid]) {
    run.concept_progress[cid] = {
      current_exercise_level: 1,
      exercise_streaks: {}
    };
  }
}

function recordHistory(run, exerciseType) {
  run.history.push(exerciseType);
  run.step_counter++;
}

function lastExercise(run) {
  if (!run.history.length) return null;
  return run.history[run.history.length - 1];
}

// ==============================
// SET COMPATIBILITY VALIDATION
// ==============================

function validateSetCompatibility(activeConceptIds) {
  const templates = window.SENTENCE_TEMPLATES || [];

  const validTemplates = templates.filter(template =>
    template.concept_ids.every(cid => activeConceptIds.includes(cid))
  );

  return validTemplates.length > 0;
}

// ==============================
// Advancement Logic
// ==============================

function handleAdvancement(run, cid, exerciseType, correct) {
  const concept = run.concept_progress[cid];
  if (!concept.exercise_streaks[exerciseType]) {
    concept.exercise_streaks[exerciseType] = 0;
  }

  if (!correct) {
    concept.exercise_streaks[exerciseType] = 0;
    return;
  }

  concept.exercise_streaks[exerciseType]++;

  if (concept.exercise_streaks[exerciseType] >= 2) {
    if (concept.current_exercise_level === exerciseType) {
      concept.current_exercise_level++;
    }
  }
}

// ==============================
// Scheduler
// ==============================

function scheduleNextExercise(run, activeConceptIds) {
  const exercises = [1, 3, 4, 5, 6];

  const previous = lastExercise(run);

  for (let exerciseType of exercises) {

    if (exerciseType === previous) continue;

    const eligibleConcepts = activeConceptIds.filter(cid => {
      ensureConceptInitialized(run, cid);
      return getConceptLevel(run, cid) === exerciseType;
    });

    if (!eligibleConcepts.length) continue;

    const selected = eligibleConcepts[0];

    return {
      exerciseType,
      conceptId: selected
    };
  }

  return null;
}

// ==============================
// Exercise Rendering
// ==============================

function renderExercise(run, activeConceptIds) {
  const session = scheduleNextExercise(run, activeConceptIds);

  const container = document.getElementById("exercise-container");

  if (!session) {
    container.innerHTML = `<div>No valid exercise</div>`;
    return;
  }

  const { exerciseType, conceptId } = session;

  recordHistory(run, exerciseType);

  container.innerHTML = `
    <div>
      <h3>Exercise ${exerciseType}</h3>
      <p>Concept: ${conceptId}</p>
      <button id="correct-btn">Simulate Correct</button>
      <button id="incorrect-btn">Simulate Incorrect</button>
    </div>
  `;

  document.getElementById("correct-btn").onclick = () => {
    handleAdvancement(run, conceptId, exerciseType, true);
    renderExercise(run, activeConceptIds);
  };

  document.getElementById("incorrect-btn").onclick = () => {
    handleAdvancement(run, conceptId, exerciseType, false);
    renderExercise(run, activeConceptIds);
  };
}

// ==============================
// Session Initialization
// ==============================

function startSession() {
  const setName = document.getElementById("set-select").value;

  const activeConceptIds = window.VOCAB_INDEX[setName] || [];

  const container = document.getElementById("exercise-container");

  if (!activeConceptIds.length) {
    container.innerHTML = `<div>No concepts available for this set</div>`;
    return;
  }

  if (!validateSetCompatibility(activeConceptIds)) {
    container.innerHTML = `
      <div>
        This set cannot generate sentence exercises yet.
        <br><br>
        Please select a compatible set.
      </div>
    `;
    return;
  }

  const run = window.getCurrentRun();

  renderExercise(run, activeConceptIds);
}

// ==============================
// Load Button Binding
// ==============================

document.getElementById("load-btn").addEventListener("click", startSession);
=======
=======
>>>>>>> Stashed changes
// Zero to Hero – data-driven learning app (Stage 1 enabled)
// VERSION: v0.8.2-dom-guards
//
// This file fixes the crash:
// "Cannot read properties of null (reading 'addEventListener')"
// by:
// 1) Waiting for DOMContentLoaded
// 2) Guarding all event bindings

document.addEventListener("DOMContentLoaded", () => {
  // --------------------
  // DOM references (guarded)
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

  // Small helper to avoid hard crashes if HTML changes.
  function mustHave(el, name) {
    if (!el) {
      console.warn(`[app.js] Missing required element: #${name}`);
      return false;
    }
    return true;
  }

  // --------------------
  // External links (placeholders)
  // --------------------
  const linkBlueprint = document.getElementById("link-blueprint");
  const linkSkool = document.getElementById("link-skool");
  const linkCoaching = document.getElementById("link-coaching");

  if (linkBlueprint) linkBlueprint.href = "#";
  if (linkSkool) linkSkool.href = "#";
  if (linkCoaching) linkCoaching.href = "#";

  // --------------------
  // App entry / exit
  // --------------------
  if (openAppBtn && startScreen && learningScreen) {
    openAppBtn.addEventListener("click", async () => {
      startScreen.classList.remove("active");
      learningScreen.classList.add("active");

      // Stage 1: sentence comprehension
      const tl = targetSel?.value || "pt";
      const sl = supportSel?.value || "en";
      await loadStage1Comprehension(tl, sl);
    });
  } else {
    mustHave(openAppBtn, "open-app");
    mustHave(startScreen, "start-screen");
    mustHave(learningScreen, "learning-screen");
  }

  if (quitBtn && startScreen && learningScreen) {
    quitBtn.addEventListener("click", () => {
      learningScreen.classList.remove("active");
      startScreen.classList.add("active");
    });
  } else {
    mustHave(quitBtn, "quit-learning");
  }

  // --------------------
  // Dataset viewer (dev / later use)
  // --------------------
  if (loadBtn) {
    loadBtn.addEventListener("click", async () => {
      const file = datasetSel?.value || "verbs.json";
      const tl = targetSel?.value || "pt";
      const sl = supportSel?.value || "en";
      await renderDataset(file, tl, sl);
    });
  } else {
    // This is the crash you hit earlier (loadBtn was null in the other file).
    mustHave(loadBtn, "load");
  }

  async function renderDataset(file, targetLang, supportLang) {
    if (!mustHave(subtitle, "session-subtitle") || !mustHave(content, "content")) return;

    subtitle.textContent = `Showing: ${String(file).replace(".json", "")} | Target: ${String(targetLang).toUpperCase()} | Support: ${String(supportLang).toUpperCase()}`;
    content.innerHTML = "Loading...";

    let data;
    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      content.innerHTML = `Could not load <strong>${escapeHtml(file)}</strong>. Make sure it exists.`;
      return;
    }

    const tPack = data.languages?.[targetLang];
    const sPack = data.languages?.[supportLang];
    if (!tPack || !sPack) {
      const available = Object.keys(data.languages || {}).join(", ");
      content.innerHTML = `Language missing in ${escapeHtml(file)}. Available: ${escapeHtml(available)}`;
      return;
    }

    content.innerHTML = "";
    for (const concept of data.concepts || []) {
      const t = tPack.forms?.[concept.concept_id] || [];
      const s = sPack.forms?.[concept.concept_id] || [];

      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <strong>${escapeHtml(concept.concept_id)}</strong>
        <div class="forms">${escapeHtml(t.join(", "))} — ${escapeHtml(s.join(", "))}</div>
      `;
      content.appendChild(row);
    }
  }

  // --------------------
  // Stage 1 – Sentence comprehension
  // --------------------
  async function loadStage1Comprehension(targetLang, supportLang) {
    if (!mustHave(subtitle, "session-subtitle") || !mustHave(content, "content")) return;

    subtitle.textContent = "Read and understand";
    content.innerHTML = "Loading sentence...";

    let data;
    try {
      const res = await fetch("sentence_templates.json", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch (e) {
      content.innerHTML = "Could not load sentence templates.";
      return;
    }

    // For now: always first template
    const tpl = data.templates?.[0];
    if (!tpl) {
      content.innerHTML = "No templates found.";
      return;
    }

    const sentence = tpl.render?.[targetLang] || "";
    const questionText = buildWhoQuestionFromSupportSentence(tpl, supportLang);

    // Pick 3 pronoun options (hardcoded concept_ids for now)
    const options = [
      "FIRST_PERSON_SINGULAR",
      "SECOND_PERSON",
      "THIRD_PERSON_SINGULAR"
    ];

    // Determine the correct answer by checking the template's concept_ids
    // (Template should include one of these pronoun concepts.)
    const correct = options.find(x => (tpl.concept_ids || []).includes(x)) || options[0];

    content.innerHTML = `
      <div class="row">
        <strong>Read and understand</strong>
        <div class="forms" style="font-size:1.2rem;margin:0.5rem 0 0.75rem;">
          ${escapeHtml(sentence)}
        </div>
        <div class="forms">${escapeHtml(questionText)}</div>

        <div id="choices" style="margin-top:0.75rem;display:flex;gap:10px;flex-wrap:wrap;"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");
    if (!choicesDiv) return;

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "secondary small";
      btn.type = "button";
      btn.textContent = pronounLabel(opt, supportLang);

      btn.onclick = () => {
        // Disable all buttons
        [...choicesDiv.children].forEach(b => (b.disabled = true));

        const ok = opt === correct;
        btn.textContent += ok ? " ✓" : " ✕";
      };

      choicesDiv.appendChild(btn);
    });
  }

  // --------------------
  // Helpers
  // --------------------
  function buildWhoQuestionFromSupportSentence(tpl, supportLang) {
    const supportSentence = tpl.render?.[supportLang];
    if (!supportSentence) return "Who?";

    // Language-specific "who" word + minimal subject->who transform.
    // Stage 1 rule: reuse the SUPPORT sentence verb form (no conjugation engine).
    switch (supportLang) {
      case "en":
        return whoFromSvoSentence(supportSentence, "Who");
      case "pt":
        return whoFromSvoSentence(supportSentence, "Quem");
      case "ja":
        return whoFromJapaneseSentence(supportSentence);
      default:
        return whoFromSvoSentence(supportSentence, "Who");
    }
  }

  function whoFromSvoSentence(sentence, whoWord) {
    // Removes trailing punctuation and replaces the first token (subject) with whoWord.
    // Example: "He eats food." -> "Who eats food?"
    let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");
    const parts = clean.split(/\s+/);
    if (parts.length < 2) return `${whoWord}?`;
    parts[0] = whoWord;
    return `${parts.join(" ")}?`;
  }

  function whoFromJapaneseSentence(sentence) {
    // Minimal, Stage 1-safe heuristic for the current JP render style:
    // "彼は食べ物を食べる。" -> "誰が食べ物を食べる？"
    let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");

    const idxWa = clean.indexOf("は");
    const idxGa = clean.indexOf("が");
    let cutIdx = -1;

    if (idxWa !== -1 && (idxGa === -1 || idxWa < idxGa)) cutIdx = idxWa;
    if (idxGa !== -1 && (idxWa === -1 || idxGa < idxWa)) cutIdx = idxGa;

    if (cutIdx !== -1) {
      clean = clean.slice(cutIdx + 1).trim();
    }

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
});
>>>>>>> Stashed changes
