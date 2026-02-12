// scheduler.js — Step 3b: Adaptive selection
// VERSION: v0.12.1-adaptive

(function () {

  const STAGE1_THRESHOLD = 2;
  const STAGE2_THRESHOLD = 2;

  const COOLDOWN_CORRECT = 3;
  const COOLDOWN_INCORRECT = 1;

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

  function scoreConcept(run, concept_id, exercise_type) {
    const p = run.concept_progress[concept_id] || {};
    const streaks = p.exercise_streaks || {};
    const streak = streaks[exercise_type] || 0;

    // Lower streak → higher score
    const streakScore = 10 - streak;

    // Fewer total attempts → higher score
    const attempts = p.stage1_correct + (p.stage2_attempts || 0) || 0;
    const attemptScore = 5 - attempts;

    return streakScore + attemptScore;
  }

  function pickBest(run, candidates, exercise_type) {
    const filtered = candidates.filter(c =>
      !sameExerciseAsLast(run, exercise_type) &&
      !recentlySeenConcept(run, c.concept_id)
    );

    if (!filtered.length) return null;

    filtered.sort((a, b) =>
      scoreConcept(run, b.concept_id, exercise_type) -
      scoreConcept(run, a.concept_id, exercise_type)
    );

    return filtered[0];
  }

  function getNextExercise(run, templates, vocabIndex) {

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

    // =========================
    // Exercise 1 (Exposure)
    // =========================
    let exposure = concepts.filter(c =>
      c.state === "NEW" &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    const bestExposure = pickBest(run, exposure, 1);
    if (bestExposure) {
      return {
        exercise_type: 1,
        concept_id: bestExposure.concept_id,
        template: templates.find(t => t.concepts.includes(bestExposure.concept_id))
      };
    }

    // =========================
    // Exercise 3
    // =========================
    let stage1WithTemplate = concepts.filter(c =>
      (c.state === "NEW" || c.state === "SEEN") &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    const best3 = pickBest(run, stage1WithTemplate, 3);
    if (best3) {
      return {
        exercise_type: 3,
        concept_id: best3.concept_id,
        template: templates.find(t => t.concepts.includes(best3.concept_id))
      };
    }

    // =========================
    // Exercise 4
    // =========================
    let stage1WordOnly = concepts.filter(c =>
      c.state === "NEW" || c.state === "SEEN"
    );

    const best4 = pickBest(run, stage1WordOnly, 4);
    if (best4) {
      return {
        exercise_type: 4,
        concept_id: best4.concept_id
      };
    }

    // =========================
    // Exercise 6
    // =========================
    let matchable = concepts.filter(c =>
      c.meta?.interaction_profile?.match === true
    );

    const best6 = pickBest(run, matchable, 6);
    if (best6 && matchable.length >= 5) {
      return {
        exercise_type: 6,
        concept_ids: matchable.slice(0, 5).map(c => c.concept_id)
      };
    }

    // =========================
    // Exercise 5
    // =========================
    let recallCandidates = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;
        const c = concepts.find(x => x.concept_id === q.answer);
        if (!c || c.state !== "RECALL_READY") return null;
        return { concept: c, template: t };
      })
      .filter(Boolean);

    const best5 = pickBest(
      run,
      recallCandidates.map(x => x.concept),
      5
    );

    if (best5) {
      const template = recallCandidates.find(x =>
        x.concept.concept_id === best5.concept_id
      ).template;

      return {
        exercise_type: 5,
        concept_id: best5.concept_id,
        template
      };
    }

    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
