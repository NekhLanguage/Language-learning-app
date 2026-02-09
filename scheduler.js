// scheduler.js — Step 3: Memory usage
// Uses run.history + step_counter
// Enforces:
// - no same exercise twice in a row
// - outcome-aware cooldowns
// - no ladder violations
// - no forward leakage

(function () {

  const STAGE1_THRESHOLD = 2;
  const STAGE2_THRESHOLD = 2;

  // --- cooldown values (INTENTIONALLY SIMPLE) ---
  const COOLDOWN_CORRECT = 3;    // steps
  const COOLDOWN_INCORRECT = 1;  // steps

  function getConceptState(progress) {
    if (!progress) return "NEW";
    if (progress.stage2_correct >= STAGE2_THRESHOLD) return "STABLE";
    if (progress.stage1_correct >= STAGE1_THRESHOLD) return "RECALL_READY";
    return "SEEN";
  }

  function last(arr) {
    return arr.length ? arr[arr.length - 1] : null;
  }

  function cooldownFor(result) {
    if (result === "incorrect") return COOLDOWN_INCORRECT;
    if (result === "correct") return COOLDOWN_CORRECT;
    return 0;
  }

  function recentlySeenConcept(run, concept_id) {
    const h = last(run.history);
    if (!h || h.concept_id !== concept_id) return false;

    const cooldown = cooldownFor(h.result);
    return (run.step_counter - h.step) <= cooldown;
  }

  function sameExerciseAsLast(run, exercise_type) {
    const h = last(run.history);
    return h && h.exercise_type === exercise_type;
  }

  function getNextExercise(run, templates, vocabIndex) {
    // --- safety init ---
    if (run.step_counter === undefined) run.step_counter = 0;
    if (!Array.isArray(run.history)) run.history = [];

    const concepts = Object.keys(vocabIndex).map(cid => {
      const progress = run.concept_progress[cid];
      return {
        concept_id: cid,
        state: getConceptState(progress),
        meta: vocabIndex[cid].concept
      };
    });

    /* =====================================================
       Helper: filter candidates with memory rules
       ===================================================== */
    function filterWithMemory(candidates, exercise_type) {
      return candidates.filter(c =>
        !sameExerciseAsLast(run, exercise_type) &&
        !recentlySeenConcept(run, c.concept_id)
      );
    }

    /* =====================================================
       Stage 1 — Exercise 1 (Exposure)
       ===================================================== */
    let exposure = concepts.filter(c =>
      c.state === "NEW" &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    exposure = filterWithMemory(exposure, 1);

    if (exposure.length > 0) {
      const c = exposure[0];
      return {
        exercise_type: 1,
        concept_id: c.concept_id,
        template: templates.find(t => t.concepts.includes(c.concept_id))
      };
    }

    /* =====================================================
       Stage 1 — Exercise 3 (Comprehension)
       ===================================================== */
    let stage1WithTemplate = concepts.filter(c =>
      (c.state === "NEW" || c.state === "SEEN") &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    stage1WithTemplate = filterWithMemory(stage1WithTemplate, 3);

    if (stage1WithTemplate.length > 0) {
      const c = stage1WithTemplate[0];
      return {
        exercise_type: 3,
        concept_id: c.concept_id,
        template: templates.find(t => t.concepts.includes(c.concept_id))
      };
    }

    /* =====================================================
       Stage 1 — Exercise 4 (Click word)
       ===================================================== */
    let stage1WordOnly = concepts.filter(c =>
      c.state === "NEW" || c.state === "SEEN"
    );

    stage1WordOnly = filterWithMemory(stage1WordOnly, 4);

    if (stage1WordOnly.length > 0) {
      return {
        exercise_type: 4,
        concept_id: stage1WordOnly[0].concept_id
      };
    }

    /* =====================================================
       Stage 2 — Exercise 6 (Matching)
       ===================================================== */
    let matchable = concepts.filter(c =>
      c.meta?.interaction_profile?.match === true
    );

    matchable = filterWithMemory(matchable, 6);

    if (matchable.length >= 5 && Math.random() < 0.15) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    /* =====================================================
       Stage 2 — Exercise 5 (Guided recall)
       ===================================================== */
    let recallCandidates = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;
        const c = concepts.find(x => x.concept_id === q.answer);
        if (!c || c.state !== "RECALL_READY") return null;
        return { concept: c, template: t };
      })
      .filter(Boolean);

    recallCandidates = recallCandidates.filter(rc =>
      !sameExerciseAsLast(run, 5) &&
      !recentlySeenConcept(run, rc.concept.concept_id)
    );

    if (recallCandidates.length > 0) {
      return {
        exercise_type: 5,
        concept_id: recallCandidates[0].concept.concept_id,
        template: recallCandidates[0].template
      };
    }

    /* =====================================================
       Fallback — loosen memory but keep safety
       ===================================================== */
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