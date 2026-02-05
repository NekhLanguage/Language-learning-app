// scheduler.js — Stage 1 + Stage 2
// Exercise 3 = comprehension
// Exercise 4 = click correct word
// Exercise 5 = guided recall
// Exercise 6 = matching

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
        meta: vocabIndex[cid].concept
      };
    });

    /* =========================
       Stage 1 — Exercise 3
       ========================= */
    const stage1WithTemplate = concepts.filter(c =>
      (c.state === "NEW" || c.state === "SEEN") &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    if (stage1WithTemplate.length > 0) {
      const c = stage1WithTemplate[0];
      return {
        exercise_type: 3,
        concept_id: c.concept_id,
        template: templates.find(t => t.concepts.includes(c.concept_id))
      };
    }

    /* =========================
       Stage 1 — Exercise 4
       ========================= */
    const stage1WordOnly = concepts.filter(c =>
      (c.state === "NEW" || c.state === "SEEN")
    );

    if (stage1WordOnly.length > 0) {
      return {
        exercise_type: 4,
        concept_id: stage1WordOnly[0].concept_id
      };
    }

    /* =========================
       Stage 2 — Exercise 6
       ========================= */
    const matchable = concepts.filter(c =>
      c.meta?.interaction_profile?.match === true
    );

    if (matchable.length >= 5 && Math.random() < 0.15) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    /* =========================
       Stage 2 — Exercise 5
       ========================= */
    const recallCandidates = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;
        const c = concepts.find(x => x.concept_id === q.answer);
        if (!c || c.state !== "RECALL_READY") return null;
        return { template: t, concept_id: q.answer };
      })
      .filter(Boolean);

    if (recallCandidates.length > 0) {
      return {
        exercise_type: 5,
        concept_id: recallCandidates[0].concept_id,
        template: recallCandidates[0].template
      };
    }

    if (matchable.length >= 5) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
