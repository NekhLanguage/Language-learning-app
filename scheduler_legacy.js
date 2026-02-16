// scheduler.js — Progression scheduling + forward leakage enforcement
// VERSION: v0.14.0-progression-rules

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

  // Forward leakage guard: a template is only valid for an exercise if
  // every real concept id it uses has reached that exercise level.
  // (Placeholders like "PRONOUN" are ignored because they are not concept_ids.)
  function templateAllowed(run, template, vocabIndex, minLevel) {
    const list = Array.isArray(template?.concepts) ? template.concepts : [];
    for (const cid of list) {
      if (!vocabIndex[cid]) continue; // placeholder or unknown
      const p = run.concept_progress?.[cid];
      const lvl = p?.current_exercise_level ?? 1;
      if (lvl < minLevel) return false;
    }
    return true;
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
      templates.some(t =>
        t.concepts.includes(c.concept_id) &&
        templateAllowed(run, t, vocabIndex, 1)
      )
    );

    const bestExposure = pickBest(run, exposure, 1);
    if (bestExposure) {
      return {
        exercise_type: 1,
        concept_id: bestExposure.concept_id,
        template: templates.find(t =>
          t.concepts.includes(bestExposure.concept_id) &&
          templateAllowed(run, t, vocabIndex, 1)
        )
      };
    }

    /* =========================
       Exercise 3
       ========================= */
    let ex3 = concepts.filter(c =>
      c.current_exercise_level >= 3 &&
      templates.some(t =>
        t.concepts.includes(c.concept_id) &&
        templateAllowed(run, t, vocabIndex, 3)
      )
    );

    const best3 = pickBest(run, ex3, 3);
    if (best3) {
      return {
        exercise_type: 3,
        concept_id: best3.concept_id,
        template: templates.find(t =>
          t.concepts.includes(best3.concept_id) &&
          templateAllowed(run, t, vocabIndex, 3)
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

        const answer = q.answer;
        if (!answer) return null;

        const progress = run.concept_progress?.[answer];
        if (!progress || (progress.current_exercise_level ?? 1) < 5) return null;
        if (!templateAllowed(run, t, vocabIndex, 5)) return null;

        return { concept_id: answer, template: t };
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

    /* =========================
       Exercise 6 — Matching
       ========================= */
    // Note: app.js currently has a placeholder renderer; scheduler support is still useful
    // so we can verify strict ladder + forward leakage.
    const ex6Pool = concepts
      .filter(c => c.current_exercise_level >= 6)
      .map(c => c.concept_id);

    if (!sameExerciseAsLast(run, 6) && ex6Pool.length >= 4) {
      // simple deterministic pick: weakest concepts first by streak
      ex6Pool.sort((a, b) => scoreConcept(run, b, 6) - scoreConcept(run, a, 6));
      return { exercise_type: 6, concept_ids: ex6Pool.slice(0, 4) };
    }

    return { exercise_type: null };
  }

  window.Scheduler = { getNextExercise };

})();
