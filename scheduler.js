// scheduler.js — Fixed level initialization
// VERSION: v0.13.3-level-init-fix

(function () {

  const COOLDOWN_CORRECT = 3;
  const COOLDOWN_INCORRECT = 1;

  function last(arr) {
    return arr.length ? arr[arr.length - 1] : null;
  }

  function cooldownFor(result) {
    if (result === "incorrect") return COOLDOWN_INCORRECT;
    if (result === "correct") return COOLDOWN_CORRECT;
    return 0;
  }

  function recentlySeenConcept(run, concept_id) {
    const h = last(run.history || []);
    if (!h || h.concept_id !== concept_id) return false;
    const cooldown = cooldownFor(h.result);
    return (run.step_counter - h.step) <= cooldown;
  }

  function sameExerciseAsLast(run, exercise_type) {
    const h = last(run.history || []);
    return h && h.exercise_type === exercise_type;
  }

  function scoreConcept(run, concept_id, exercise_type) {
    const p = run.concept_progress[concept_id] || {};
    const streaks = p.exercise_streaks || {};
    const streak = streaks[exercise_type] || 0;
    return 10 - streak;
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

    if (!run.concept_progress) run.concept_progress = {};
    if (!run.history) run.history = [];
    if (!run.step_counter) run.step_counter = 0;

    const concepts = Object.keys(vocabIndex).map(cid => {

      // --- CRITICAL FIX: ensure concept_progress always exists ---
      if (!run.concept_progress[cid]) {
        run.concept_progress[cid] = {
          current_exercise_level: 1,
          exercise_streaks: {}
        };
      }

      const progress = run.concept_progress[cid];

      return {
        concept_id: cid,
        current_exercise_level: progress.current_exercise_level ?? 1,
        meta: vocabIndex[cid].concept
      };
    });

    /* =========================
       Exercise 1 — Exposure
       ========================= */
    let exposure = concepts.filter(c =>
      c.current_exercise_level === 1 &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    const bestExposure = pickBest(run, exposure, 1);
    if (bestExposure) {
      return {
        exercise_type: 1,
        concept_id: bestExposure.concept_id,
        template: templates.find(t =>
          t.concepts.includes(bestExposure.concept_id)
        )
      };
    }

    /* =========================
       Exercise 3
       ========================= */
    let ex3 = concepts.filter(c =>
      c.current_exercise_level >= 3 &&
      templates.some(t => t.concepts.includes(c.concept_id))
    );

    const best3 = pickBest(run, ex3, 3);
    if (best3) {
      return {
        exercise_type: 3,
        concept_id: best3.concept_id,
        template: templates.find(t =>
          t.concepts.includes(best3.concept_id)
        )
      };
    }

    /* =========================
       Exercise 4
       ========================= */
    let ex4 = concepts.filter(c =>
      c.current_exercise_level >= 4
    );

    const best4 = pickBest(run, ex4, 4);
    if (best4) {
      return {
        exercise_type: 4,
        concept_id: best4.concept_id
      };
    }

    /* =========================
       Exercise 5
       ========================= */
    let ex5 = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;

        const progress = run.concept_progress[q.answer];
        if (!progress || progress.current_exercise_level < 5) return null;

        return { concept_id: q.answer, template: t };
      })
      .filter(Boolean);

    const best5 = pickBest(
      run,
      ex5.map(x => ({ concept_id: x.concept_id })),
      5
    );

    if (best5) {
      const template = ex5.find(x =>
        x.concept_id === best5.concept_id
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
