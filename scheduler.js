// scheduler.js — current, correct version
// Exercise 3 = Stage 1 comprehension
// Exercise 5 = Stage 2 guided recall (question-driven)
// Exercise 6 = Stage 2 matching

(function () {

  const STAGE1_THRESHOLD = 2;
  const STAGE2_THRESHOLD = 2;

  function getConceptState(progress) {
    if (!progress) return "NEW";
    if (progress.stage2_correct >= STAGE2_THRESHOLD) return "STABLE";
    if (progress.stage1_correct >= STAGE1_THRESHOLD) return "RECALL_READY";
    return "SEEN";
  }

  function getNextExercise(run, templates, vocabIndex) {
    const concepts = Object.keys(vocabIndex).map(cid => {
      const progress = run.concept_progress[cid];
      return {
        concept_id: cid,
        state: getConceptState(progress),
        progress: progress || {},
        meta: vocabIndex[cid].concept
      };
    });

    /* =====================================================
       Stage 1 — Exercise 3 (sentence comprehension)
       ===================================================== */

    const stage1Candidates = concepts.filter(c =>
      (c.state === "NEW" || c.state === "SEEN") &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    if (stage1Candidates.length > 0) {
      const c = stage1Candidates[0];
      return {
        exercise_type: 3,
        concept_id: c.concept_id,
        template: templates.find(t => t.concepts.includes(c.concept_id))
      };
    }

    /* =====================================================
       Stage 2 — Exercise 6 (matching, interleaved)
       ===================================================== */

    const matchable = concepts.filter(c =>
      c.meta?.interaction_profile?.match === true
    );

    if (matchable.length >= 5 && Math.random() < 0.15) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    /* =====================================================
       Stage 2 — Exercise 5 (guided recall, CORRECT)
       ===================================================== */

    const recallCandidates = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;

        const answerCid = q.answer;
        const concept = concepts.find(c => c.concept_id === answerCid);
        if (!concept) return null;

        return { template: t, concept };
      })
      .filter(x => x && x.concept.state === "RECALL_READY");

    if (recallCandidates.length > 0) {
      const { template } = recallCandidates[0];
      const q = template.questions[0];

      return {
        exercise_type: 5,
        concept_id: q.answer, // 🔒 authoritative concept
        template
      };
    }

    /* =====================================================
       Fallback — Exercise 6 (matching)
       ===================================================== */

    if (matchable.length >= 5) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    /* =====================================================
       No valid exercise
       ===================================================== */

    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
