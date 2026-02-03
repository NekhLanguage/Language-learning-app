// scheduler.js — v2 (NON-MODULE)
// Scheduler-driven exercise selection
// Lexical concepts are gated, grammar/glue concepts are always allowed.

(function () {

  // --------------------
  // Concept state
  // --------------------
  function getConceptState(progress) {
    if (!progress || progress.seen_stage1 === 0) return "NEW";
    if (progress.seen_stage1 < 3) return "RECOGNIZING";
    if (progress.seen_stage1 >= 3 && progress.stage2_attempts === 0) return "UNDERSTOOD";
    if (progress.stage2_attempts > 0 && progress.stage2_correct < 2) return "RECALL_READY";
    if (progress.stage2_correct >= 2) return "STABLE";
    return "UNDERSTOOD";
  }

  function introduced(run, cid) {
    const p = run.concept_progress?.[cid];
    return p && p.seen_stage1 >= 1;
  }

  // --------------------
  // Glue / grammar concepts
  // --------------------
  function isGlueConcept(conceptId) {
    const meta = window.VOCAB_INDEX?.[conceptId]?.concept;
    if (!meta) return false;

    // Grammar glue should never block sentence usage
    return (
      meta.type === "pronoun" ||
      meta.type === "connector" ||
      meta.type === "article" ||
      meta.grammar === true
    );
  }

  // --------------------
  // Template selection
  // --------------------
  function pickTemplateForConcept(templates, run, conceptId) {
    if (!Array.isArray(templates)) return null;

    const candidates = templates.filter(t =>
      Array.isArray(t.concepts) &&
      t.concepts.includes(conceptId) &&
      t.concepts.every(cid =>
        introduced(run, cid) || isGlueConcept(cid)
      )
    );

    return candidates.length ? candidates[0] : null;
  }

  // --------------------
  // Main scheduler
  // --------------------
  function getNextExercise(run, templates, vocabIndex) {
    const progressMap = run.concept_progress || {};

    const concepts = Object.keys(vocabIndex).map(cid => {
      const prog = progressMap[cid] || {
        seen_stage1: 0,
        stage2_attempts: 0,
        stage2_correct: 0
      };

      return {
        concept_id: cid,
        state: getConceptState(prog),
        meta: vocabIndex[cid].concept
      };
    });

    // Priority: guided recall first
    const recallReady = concepts.find(c => c.state === "RECALL_READY");
    if (recallReady) {
      return {
        exercise_type: 5,
        concept_id: recallReady.concept_id,
        template: pickTemplateForConcept(
          templates,
          run,
          recallReady.concept_id
        )
      };
    }

    // Fallback (Stage 1 / idle)
    return {
      exercise_type: 3,
      concept_id: null,
      template: null
    };
  }

  // --------------------
  // Public API
  // --------------------
  window.Scheduler = {
    getNextExercise
  };

})();
