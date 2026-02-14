// user_state_v2.js — v1 (non-module)
// Persistent user + run model (localStorage)
// Exposes: window.UserState.{loadUser,saveUser,ensureUser,createRun,setCurrentRun}

(function () {
  const STORAGE_KEY = 'zero_to_hero_user_v1';

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function loadUser() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[UserState] Failed to parse user state, resetting.');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function saveUser(user) {
    user.last_active = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function createRun(target_language, support_language) {
    return {
      run_id: uuid(),
      target_language,
      support_language,
      created_at: Date.now(),
      last_active: Date.now(),
      step_counter: 0,
      history: [],
      stage_state: {
        stage_1_unlocked: true,
        stage_2_unlocked: false,
        stage_3_unlocked: false
      },
      concept_progress: {}
    };
  }

  function ensureUser() {
    let user = loadUser();
    if (!user) {
      user = {
        user_id: uuid(),
        created_at: Date.now(),
        last_active: Date.now(),
        runs: {},
        current_run_id: null
      };

      const run = createRun('pt', 'en');
      user.runs[run.run_id] = run;
      user.current_run_id = run.run_id;
      saveUser(user);
    }
    return user;
  }

  function setCurrentRun(user, run_id) {
    if (!user || !user.runs || !user.runs[run_id]) throw new Error('Run not found');
    user.current_run_id = run_id;
    user.runs[run_id].last_active = Date.now();
    saveUser(user);
  }

  window.UserState = { loadUser, saveUser, ensureUser, createRun, setCurrentRun };
})();
