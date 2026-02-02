// scheduler.js — v1 (NON-MODULE)
// Pure scheduling logic for exercise selection.
// Exposes window.Scheduler.getNextExercise

(function () {

  function getConceptState(progress) {
    if (!progress || progress.seen_stage1 === 0) return 'NEW';
    if (progress.seen_stage1 < 3) return 'RECOGNIZING';
    if (progress.seen_stage1 >= 3 && progress.stage2_attempts === 0) return 'UNDERSTOOD';
    if (progress.stage2_attempts > 0 && progress.stage2_correct < 2) return 'RECALL_READY';
    if (progress.stage2_correct >= 2) return 'STABLE';
    return 'UNDERSTOOD';
  }

  function pickTemplateWithConcept(templates, concept_id) {
    if (!templates || !Array.isArray(templates)) return null;
    const candidates = templates.filter(t => Array.isArray(t.concepts) && t.concepts.includes(concept_id));
    return candidates.length ? candidates[0].template_id : null;
  }

  function getNextExercise(run, templates, vocabIndex) {
    const progressMap = run.concept_progress || {};

    const concepts = Object.keys(vocabIndex).map(cid => {
      const prog = progressMap[cid] || { seen_stage1: 0, stage2_attempts: 0, stage2_correct: 0 };
      return {
        concept_id: cid,
        state: getConceptState(prog),
        meta: vocabIndex[cid]
      };
    });

    // 1️⃣ Introduce NEW concepts
    const newConcept = concepts.find(c => c.state === 'NEW' && c.meta.sentence_use !== false);
    if (newConcept) {
      return { exercise_type: 1, concept_id: newConcept.concept_id, template_id: null };
    }

    // 2️⃣ Reinforce recognizing concepts
    const recognizing = concepts.find(c => c.state === 'RECOGNIZING');
    if (recognizing) {
      return {
        exercise_type: 3,
        concept_id: recognizing.concept_id,
        template_id: pickTemplateWithConcept(templates, recognizing.concept_id)
      };
    }

    // 3️⃣ Guided recall
    const recallReady = concepts.find(c => c.state === 'RECALL_READY');
    if (recallReady) {
      return {
        exercise_type: 5,
        concept_id: recallReady.concept_id,
        template_id: pickTemplateWithConcept(templates, recallReady.concept_id)
      };
    }

    // 4️⃣ Rare review
    const stable = concepts.find(c => c.state === 'STABLE');
    if (stable) {
      return {
        exercise_type: 8,
        concept_id: stable.concept_id,
        template_id: pickTemplateWithConcept(templates, stable.concept_id)
      };
    }

    // Fallback
    return { exercise_type: 3, concept_id: null, template_id: null };
  }

  window.Scheduler = { getNextExercise };

})();
