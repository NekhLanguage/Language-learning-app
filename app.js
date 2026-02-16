// Zero to Hero – Template-Driven Blueprint Engine
// VERSION: v0.9.18-surface-aware-blanking

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.18-surface-aware-blanking";

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
      run.progress[cid] = { level: 1, streak: 0, cooldown: 0 };
    }
    return run.progress[cid];
  }

  function levelOf(cid) {
    return ensureProgress(cid).level;
  }

  function decrementCooldowns() {
    for (const cid of Object.keys(run.progress)) {
      if (run.progress[cid].cooldown > 0) run.progress[cid].cooldown--;
    }
  }

  function initRun() {
    const allConcepts = [...new Set(TEMPLATE_CACHE.flatMap(t => t.concepts || []))];

    run = {
      released: [],
      future: [...allConcepts],
      progress: {},
      lastTargetConcept: null
    };

    seedWithFirstTemplate();
  }

  function seedWithFirstTemplate() {
    if (!TEMPLATE_CACHE.length) return;
    const first = TEMPLATE_CACHE[0].concepts || [];

    for (const cid of first) {
      run.released.push(cid);
      ensureProgress(cid);
    }

    run.future = run.future.filter(cid => !first.includes(cid));
  }

  function releaseConcepts(n) {
    for (let i = 0; i < n && run.future.length > 0; i++) {
      const cid = run.future.shift();
      run.released.push(cid);
      ensureProgress(cid);
    }
  }

  function templateEligible(tpl) {
    return (tpl.concepts || []).every(cid => run.released.includes(cid));
  }

  function determineTargetConcept(tpl) {
    let minLevel = Infinity;
    let candidates = [];

    for (const cid of tpl.concepts) {
      const lvl = levelOf(cid);
      if (lvl < minLevel) {
        minLevel = lvl;
        candidates = [cid];
      } else if (lvl === minLevel) {
        candidates.push(cid);
      }
    }

    candidates = candidates.filter(cid => cid !== run.lastTargetConcept);
    if (!candidates.length) candidates = tpl.concepts;

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function getCooldown(level, correct) {
    if (!correct && level >= 2) return 2;
    return 4;
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);
    const currentLevel = state.level;

    state.cooldown = getCooldown(currentLevel, correct);

    if (!correct) {
      state.streak = 0;
      return;
    }

    state.streak++;

    if (state.streak >= 2) {
      state.level++;
      state.streak = 0;

      if (state.level === 3) {
        releaseConcepts(1);
      }
    }
  }

  function chooseTemplate() {
    const baseEligible = TEMPLATE_CACHE.filter(templateEligible);
    if (!baseEligible.length) return null;

    for (let threshold = 4; threshold >= 0; threshold--) {
      const candidates = baseEligible.filter(tpl => {
        const target = determineTargetConcept(tpl);
        const prog = ensureProgress(target);
        if (prog.cooldown > threshold) return false;
        if (target === run.lastTargetConcept) return false;
        return true;
      });

      if (candidates.length) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    return baseEligible[Math.floor(Math.random() * baseEligible.length)];
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
      run.lastTargetConcept = targetConcept;
      renderNext(targetLang, supportLang);
    };
  }

  function renderComprehension(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const q = tpl.questions[0];
    const correctAnswer = q.answer;
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
        [...choicesDiv.children].forEach(b => b.disabled = true);

        const correct = opt === correctAnswer;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";

        decrementCooldowns();
        applyResult(targetConcept, correct);
        run.lastTargetConcept = targetConcept;

        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function blankSentenceBySurface(sentence, surfaceToken) {
    // token-based, punctuation-tolerant, case-insensitive
    const tokens = sentence.split(" ");
    let replaced = false;

    const targetLower = String(surfaceToken || "").toLowerCase();

    const out = tokens.map(token => {
      const clean = token.replace(/[.,!?]/g, "").toLowerCase();
      if (!replaced && clean === targetLower && targetLower.length > 0) {
        replaced = true;
        // preserve punctuation if token had it
        const punct = token.match(/[.,!?]+$/);
        return "_____" + (punct ? punct[0] : "");
      }
      return token;
    });

    return { blanked: out.join(" "), didReplace: replaced };
  }

  function renderFillBlank(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    const sentence = tpl.render[targetLang];

    // NEW: use explicit surface map if provided
    const surface = tpl.surface?.[targetLang]?.[targetConcept];

    const { blanked, didReplace } = blankSentenceBySurface(sentence, surface);

    // If surface map missing/mismatch, we still show a warning line (dev-friendly)
    const warning = didReplace ? "" : `<p style="opacity:0.7;font-size:0.9rem;">
      (Dev) Could not blank: missing/incorrect surface for ${targetConcept} in ${targetLang}
    </p>`;

    // Options: correct + 3 random released
    const distractors = shuffle(run.released.filter(c => c !== targetConcept)).slice(0, 3);
    const options = shuffle([targetConcept, ...distractors]);

    content.innerHTML = `
      <div>
        <p>${blanked}</p>
        ${warning}
        <div id="choices"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = formOf(targetLang, opt);

      btn.onclick = () => {
        [...choicesDiv.children].forEach(b => b.disabled = true);

        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";

        decrementCooldowns();
        applyResult(targetConcept, correct);
        run.lastTargetConcept = targetConcept;

        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function renderNext(targetLang, supportLang) {
    const tpl = chooseTemplate();
    if (!tpl) {
      content.innerHTML = "No eligible templates.";
      return;
    }

    const targetConcept = determineTargetConcept(tpl);
    const level = levelOf(targetConcept);

    if (level === 1) renderExposure(targetLang, supportLang, tpl, targetConcept);
    else if (level === 2) renderComprehension(targetLang, supportLang, tpl, targetConcept);
    else renderFillBlank(targetLang, supportLang, tpl, targetConcept);
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
