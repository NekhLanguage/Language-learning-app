// scheduler.js — stable
// Exercise 5 = guided recall
// Exercise 6 = matching (15%)

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

    // ---------- Exercise 6 (matching) ----------
    const matchable = concepts.filter(c =>
      c.state === "STABLE" &&
      c.meta?.interaction_profile?.match === true
    );

    if (matchable.length >= 3 && Math.random() < 0.15) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 3).map(c => c.concept_id)
      };
    }

    // ---------- Exercise 5 ----------
    const recallReady = concepts.find(c => c.state === "RECALL_READY");
    if (recallReady) {
      return {
        exercise_type: 5,
        concept_id: recallReady.concept_id,
        template: templates.find(t => t.concepts.includes(recallReady.concept_id))
      };
    }

    return { exercise_type: 5 };
  }

  window.Scheduler = { getNextExercise };

})();
