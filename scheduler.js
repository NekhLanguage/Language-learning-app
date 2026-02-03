// scheduler.js — stable
// Exercise 5 = guided recall
// Exercise 6 = matching (fallback + 15% interleave)

(function () {

  function getConceptState(progress) {
    if (!progress) return "RECALL_READY"; // TEMP: Stage 2 unlocked
    if (progress.stage2_correct >= 2) return "STABLE";
    return "RECALL_READY";
  }

  function getNextExercise(run, templates, vocabIndex) {
    const concepts = Object.keys(vocabIndex).map(cid => ({
      concept_id: cid,
      state: getConceptState(run.concept_progress[cid]),
      meta: vocabIndex[cid].concept
    }));

    // ---------- Exercise 6 (matching candidates) ----------
    const matchable = concepts.filter(c =>
      c.state === "STABLE" &&
      c.meta?.interaction_profile?.match === true
    );

    // ---------- Exercise 5 (recall candidates WITH templates) ----------
    const recallWithTemplate = concepts.filter(c =>
      c.state === "RECALL_READY" &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    // ---------- Interleave matching (15%) ----------
    if (matchable.length >= 3 && Math.random() < 0.15) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 3).map(c => c.concept_id)
      };
    }

    // ---------- Primary recall path ----------
    if (recallWithTemplate.length > 0) {
      const c = recallWithTemplate[0];
      return {
        exercise_type: 5,
        concept_id: c.concept_id,
        template: templates.find(t => t.concepts.includes(c.concept_id))
      };
    }

    // ---------- Fallback: matching ----------
    if (matchable.length >= 3) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 3).map(c => c.concept_id)
      };
    }

    // ---------- Nothing valid ----------
    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
