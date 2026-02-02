// app_scheduler_hook.js
// Adds scheduler access without touching existing UI logic.

(function () {
  if (!window.Scheduler) {
    console.warn('[Scheduler] Not loaded yet.');
    return;
  }

  console.log('[Scheduler] Ready.');

  // Example debug call (remove later):
  // const next = window.Scheduler.getNextExercise(window.__RUN__, window.SENTENCE_TEMPLATES, window.VOCAB_INDEX);
  // console.log('Next exercise:', next);

})();
