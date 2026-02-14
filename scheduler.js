// scheduler.js — Level gating + adaptive memory
// VERSION: v0.13.2-level-gating-integrated

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

    const streakScore = 10 - streak;
    return streakScore;
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
      const progress = run.concept_progress[cid] || {};
      return {
        concept_id: cid,
        current_exercise_level: progress.current_exercise_level ?? 1,
        meta: vocabIndex[cid].concept
      };
    });

    /* =====================================================
       Exercise 1 — Exposure (Level 1 only)
       ===================================================== */
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

    /* =====================================================
       Exercise 3 — Comprehension (Level >= 3)
       ===================================================== */
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

    /* =====================================================
       Exercise 4 — Click Word (Level >= 4)
       ===================================================== */
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

    /* =====================================================
       Exercise 5 — Guided Recall (Level >= 5)
       ===================================================== */
    let ex5 = templates
      .map(t => {
        const q = t.questions?.[0];
        if (!q) return null;

        const progress = run.concept_progress[q.answer] || {};
        const level = progress.current_exercise_level ?? 1;

        if (level < 5) return null;

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

    /* =====================================================
       Exercise 6 — Matching (Level >= 6)
       ===================================================== */
    let ex6 = concepts.filter(c =>
      c.current_exercise_level >= 6 &&
      c.meta?.interaction_profile?.match === true
    );

    const best6 = pickBest(run, ex6, 6);
    if (best6 && ex6.length >= 5) {
      return {
        exercise_type: 6,
        concept_ids: ex6.slice(0, 5).map(c => c.concept_id)
      };
    }

    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
