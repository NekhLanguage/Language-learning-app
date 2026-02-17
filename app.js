// Zero to Hero – Strict Ladder + Strict Recognition Eligibility
// VERSION: v0.9.26-strict-recognition-gating

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.26-strict-recognition-gating";
  const MAX_LEVEL = 4;

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  console.log("Running:", APP_VERSION);
  document.title = "Zero-to-Hero • " + APP_VERSION;

  const VOCAB_FILES = [
    "adjectives.json","connectors.json","directions_positions.json",
    "glue_words.json","nouns.json","numbers.json",
    "politeness_modality.json","pronouns.json","quantifiers.json",
    "question_words.json","time_words.json","verbs.json"
  ];

  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

  async function loadAndMergeVocab() {
    window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

    for (const file of VOCAB_FILES) {
      const res = await fetch(file, { cache: "no-store" });
      const data = await res.json();

      for (const concept of data.concepts || []) {
        window.GLOBAL_VOCAB.concepts[concept.concept_id] = concept;
      }

      for (const [langCode, langData] of Object.entries(data.languages || {})) {
        if (!window.GLOBAL_VOCAB.languages[langCode]) {
          window.GLOBAL_VOCAB.languages[langCode] = { label: langData.label, forms: {} };
        }
        Object.assign(window.GLOBAL_VOCAB.languages[langCode].forms, langData.forms || {});
      }
    }
  }

  let TEMPLATE_CACHE = null;

  async function loadTemplates() {
    if (TEMPLATE_CACHE) return TEMPLATE_CACHE;
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    const data = await res.json();
    TEMPLATE_CACHE = data.templates || [];
    return TEMPLATE_CACHE;
  }

  let run = null;

  function ensureProgress(cid) {
    if (!run.progress[cid]) {
      run.progress[cid] = {
        level: 1,
        streak: 0,
        cooldown: 0,
        completed: false
      };
    }
    return run.progress[cid];
  }

  function levelOf(cid) {
    return ensureProgress(cid).level;
  }

  function decrementCooldowns() {
    Object.values(run.progress).forEach(p => {
      if (p.cooldown > 0) p.cooldown--;
    });
  }

  function initRun() {
    const allConcepts = [
      ...new Set(TEMPLATE_CACHE.flatMap(t => t.concepts || []))
    ];

    run = {
      released: [],
      future: [...allConcepts],
      progress: {}
    };

    seedInitial();
  }

  // Seed: first template concepts only (keep it minimal + deterministic)
  // You can later expand this to include WE/THEY etc. explicitly if desired.
  function seedInitial() {
    if (!TEMPLATE_CACHE.length) return;
    const first = TEMPLATE_CACHE[0].concepts || [];

    first.forEach(cid => {
      if (!run.released.includes(cid)) run.released.push(cid);
      ensureProgress(cid);
    });

    run.future = run.future.filter(cid => !run.released.includes(cid));
  }

  function releaseConcepts(n) {
    for (let i = 0; i < n && run.future.length > 0; i++) {
      const cid = run.future.shift();
      if (!run.released.includes(cid)) run.released.push(cid);
      ensureProgress(cid);
    }
  }

  function templateEligible(tpl) {
    return (tpl.concepts || []).every(cid => {
      const st = ensureProgress(cid);
      return run.released.includes(cid) && !st.completed;
    });
  }

  function determineTargetConcept(tpl) {
    let minLevel = Infinity;
    let candidates = [];

    (tpl.concepts || []).forEach(cid => {
      const st = ensureProgress(cid);
      if (st.completed) return;
      if (st.level < minLevel) {
        minLevel = st.level;
        candidates = [cid];
      } else if (st.level === minLevel) {
        candidates.push(cid);
      }
    });

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function getCooldown(level, correct) {
    if (!correct && level >= 2) return 2;
    return 4;
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);

    if (!correct) {
      state.streak = 0;
      state.cooldown = getCooldown(state.level, false);
      return;
    }

    state.streak++;
    state.cooldown = getCooldown(state.level, true);

    if (state.streak >= 2) {
      if (state.level < MAX_LEVEL) {
        state.level++;
      } else {
        state.completed = true;
      }
      state.streak = 0;

      // Release pacing: when a concept reaches level 3, release one more
      if (state.level === 3) {
        releaseConcepts(1);
      }
    }
  }

  function formOf(lang, cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
    if (!entry) return cid;
    if (Array.isArray(entry)) return entry[0];
    return cid;
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function blankSentence(sentence, surface) {
    const tokens = sentence.split(" ");
    let replaced = false;
    const targetLower = String(surface || "").toLowerCase();

    return tokens.map(token => {
      const clean = token.replace(/[.,!?]/g, "").toLowerCase();
      if (!replaced && clean === targetLower) {
        replaced = true;
        const punct = token.match(/[.,!?]+$/);
        return "_____" + (punct ? punct[0] : "");
      }
      return token;
    }).join(" ");
  }

  // ---------- Level 3/4 Recognition Eligibility ----------

  function recognitionOptionsFor(tpl, targetLang, targetConcept) {
    const lvl = levelOf(targetConcept);
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    const surface = tpl.surface?.[targetLang]?.[targetConcept];
    if (!surface) return null;

    // Candidates: same type + reached current level or higher + surface exists
    const candidates = run.released.filter(cid => {
      if (cid === targetConcept) return false;
      const st = ensureProgress(cid);
      if (st.completed) return false;

      const m = window.GLOBAL_VOCAB.concepts[cid];
      if (!m) return false;
      if (m.type !== meta.type) return false;

      // Must have reached current level (or higher)
      if (st.level < lvl) return false;

      const s = tpl.surface?.[targetLang]?.[cid];
      return !!s;
    });

    if (candidates.length < 3) return null;

    const distractors = shuffle([...candidates]).slice(0, 3);
    return shuffle([targetConcept, ...distractors]);
  }

  // Can this concept render at its level?
  function canRenderConceptAtLevel(tpl, targetLang, supportLang, targetConcept) {
    const lvl = levelOf(targetConcept);

    if (lvl === 1) return true;
    if (lvl === 2) return true;

    // lvl 3 or 4: must have recognition options
    const opts = recognitionOptionsFor(tpl, targetLang, targetConcept);
    return !!opts;
  }

  // Choose next template such that its target concept can render at its level
  function chooseRenderableTemplate(targetLang, supportLang) {
    const eligible = TEMPLATE_CACHE.filter(templateEligible);

    // Try to find a template whose target concept can render now
    const candidates = eligible.filter(tpl => {
      const target = determineTargetConcept(tpl);
      const st = ensureProgress(target);
      if (st.completed) return false;
      if (st.cooldown > 0) return false;
      return canRenderConceptAtLevel(tpl, targetLang, supportLang, target);
    });

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // If none can render at their level (usually because recognition pools too small),
    // we "prep" by selecting a level 1 or 2 concept only (exposure/comprehension),
    // never showing fake level 3/4 as comprehension.
    const prepCandidates = eligible.filter(tpl => {
      const target = determineTargetConcept(tpl);
      const st = ensureProgress(target);
      if (st.completed) return false;
      if (st.cooldown > 0) return false;
      return st.level === 1 || st.level === 2;
    });

    if (prepCandidates.length > 0) {
      return prepCandidates[Math.floor(Math.random() * prepCandidates.length)];
    }

    // If everything is cooled down or blocked, ignore cooldown (last resort)
    const lastResort = eligible.filter(tpl => {
      const target = determineTargetConcept(tpl);
      const st = ensureProgress(target);
      return !st.completed && (st.level === 1 || st.level === 2);
    });

    return lastResort.length ? lastResort[Math.floor(Math.random() * lastResort.length)] : null;
  }

  // ---------- Renderers ----------

  function renderExposure(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    content.innerHTML = `
      <div>
        <h2>${formOf(targetLang, targetConcept)}</h2>
        <p>${formOf(supportLang, targetConcept)}</p>
        <hr>
        <p>${tpl.render[targetLang]}</p>
        <p>${tpl.render[supportLang]}</p>
        <button id="continue-btn">Continue</button>
      </div>
    `;

    document.getElementById("continue-btn").onclick = () => {
      decrementCooldowns();
      applyResult(targetConcept, true);
      renderNext(targetLang, supportLang);
    };
  }

  function renderComprehension(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    const role = meta.type === "pronoun" ? "pronoun"
               : meta.type === "verb" ? "verb"
               : "object";

    const q = tpl.questions[role];
    const options = shuffle([...q.choices]);

    content.innerHTML = `
      <div>
        <p>${tpl.render[targetLang]}</p>
        <p>${q.prompt[supportLang]}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = formOf(supportLang, opt);

      btn.onclick = () => {
        const correct = opt === q.answer;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function renderRecognition(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const surface = tpl.surface?.[targetLang]?.[targetConcept];
    const sentence = tpl.render[targetLang];
    const blanked = blankSentence(sentence, surface);

    const options = recognitionOptionsFor(tpl, targetLang, targetConcept);
    if (!options) {
      // Strict rule: do not show level 3/4 unless recognition can render
      // So we should never reach here — but if we do, just re-route.
      renderNext(targetLang, supportLang);
      return;
    }

    content.innerHTML = `
      <div>
        <p>${blanked}</p>
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = tpl.surface[targetLang][opt] || formOf(targetLang, opt);

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function renderNext(targetLang, supportLang) {
    const tpl = chooseRenderableTemplate(targetLang, supportLang);

    if (!tpl) {
      content.innerHTML = "All concepts completed (or blocked by rules).";
      return;
    }

    const targetConcept = determineTargetConcept(tpl);
    const lvl = levelOf(targetConcept);

    if (lvl === 1) renderExposure(targetLang, supportLang, tpl, targetConcept);
    else if (lvl === 2) renderComprehension(targetLang, supportLang, tpl, targetConcept);
    else renderRecognition(targetLang, supportLang, tpl, targetConcept);
  }

  openAppBtn?.addEventListener("click", async () => {
    startScreen.classList.remove("active");
    learningScreen.classList.add("active");

    const tl = targetSel?.value || "pt";
    const sl = supportSel?.value || "en";

    await loadAndMergeVocab();
    await loadTemplates();
    initRun();
    renderNext(tl, sl);
  });

  quitBtn?.addEventListener("click", () => {
    learningScreen.classList.remove("active");
    startScreen.classList.add("active");
  });

});
