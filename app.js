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