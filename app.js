// Zero to Hero – Strict Ladder + Dynamic Verb Conjugation
// VERSION: v0.9.32-level4-devstart

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.31-level4";
  const MAX_LEVEL = 4;
  const DEV_START_AT_LEVEL_4 = true; // set false after stress testing

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

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

    batchSeed();
  }

  function batchSeed() {
    const initialBatch = [
      "FIRST_PERSON_SINGULAR",
      "SECOND_PERSON",
      "SECOND_PERSON_PLURAL",
      "HE",
      "SHE",
      "FIRST_PERSON_PLURAL",
      "THIRD_PERSON_PLURAL",
      "EAT","DRINK","READ","SEE","HAVE",
      "FOOD","WATER","BOOK","PHONE","JOB"
    ];

    initialBatch.forEach(cid => {
      if (!run.released.includes(cid)) {
        run.released.push(cid);
        ensureProgress(cid);
      }
    });

    run.future = run.future.filter(cid => !run.released.includes(cid));

    if (DEV_START_AT_LEVEL_4) {
      run.released.forEach(cid => {
        const state = ensureProgress(cid);
        state.level = 4;
        state.streak = 0;
      });
    }
  }

  function applyResult(cid, correct) {
    const state = ensureProgress(cid);

    if (!correct) {
      state.streak = 0;
      state.cooldown = 2;
      return;
    }

    state.streak++;
    state.cooldown = 4;

    if (state.streak >= 2) {
      if (state.level < MAX_LEVEL) {
        state.level++;
      } else {
        state.completed = true;
      }
      state.streak = 0;
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

    tpl.concepts.forEach(cid => {
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

  function chooseTemplate() {
    const eligible = TEMPLATE_CACHE.filter(templateEligible);
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  function formOf(lang, cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
    if (!entry) return cid;
    if (Array.isArray(entry)) return entry[0];
    if (typeof entry === "object" && entry.base) return entry.base;
    return cid;
  }

  function getVerbForm(verbCid, subjectCid, lang) {
    const verbData = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[verbCid];
    if (!verbData) return verbCid;

    const subject = window.GLOBAL_VOCAB.concepts[subjectCid];
    if (!subject) return verbData.base || verbCid;

    const key =
      subject.person === 3 && subject.number === "singular"
        ? "3_singular"
        : subject.person === 1 && subject.number === "singular"
        ? "1_singular"
        : subject.person === 1 && subject.number === "plural"
        ? "1_plural"
        : subject.person === 3 && subject.number === "plural"
        ? "3_plural"
        : "base";

    return verbData[key] || verbData.base || verbCid;
  }

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }

  function blankSentence(sentence, surface) {
    const tokens = String(sentence || "").split(" ");
    let replaced = false;
    const targetLower = String(surface || "").toLowerCase();

    // If we don't know what to blank, don't pretend we did.
    if (!targetLower) return String(sentence || "");

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

  function safeSurfaceForConcept(tpl, targetLang, targetConcept) {
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    const subjectCid = (tpl.concepts || []).find(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    if (meta.type === "verb") {
      return getVerbForm(targetConcept, subjectCid, targetLang);
    }

    return tpl.surface?.[targetLang]?.[targetConcept] || formOf(targetLang, targetConcept);
  }

  // -------------------------
  // Recognition option builder
  // -------------------------
  function buildRecognitionOptions(tpl, targetConcept, desiredTotalOptions) {
    const currentLevel = levelOf(targetConcept);
    const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
    if (!meta) return null;

    // Distractors must be same type, released, not completed, and have level >= currentLevel
    const pool = run.released.filter(cid => {
      if (cid === targetConcept) return false;

      const st = ensureProgress(cid);
      if (st.completed) return false;
      if (st.level < currentLevel) return false;

      const m = window.GLOBAL_VOCAB.concepts[cid];
      return m && m.type === meta.type;
    });

    // recognition requires >=4 options => need at least 3 distractors
    if (pool.length < 3) return null;

    const targetTotal = Math.max(4, Math.min(desiredTotalOptions, pool.length + 1));
    const distractorCount = targetTotal - 1;

    return shuffle([targetConcept, ...shuffle(pool).slice(0, distractorCount)]);
  }

  function renderExposure(targetLang, supportLang, tpl, targetConcept) {
    subtitle.textContent = "Level " + levelOf(targetConcept);

    content.innerHTML = `
      <h2>${formOf(targetLang, targetConcept)}</h2>
      <p>${formOf(supportLang, targetConcept)}</p>
      <hr>
      <p>${tpl.render[targetLang]}</p>
      <p>${tpl.render[supportLang]}</p>
      <button id="continue-btn">Continue</button>
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
    const role = meta?.type === "pronoun" ? "pronoun"
               : meta?.type === "verb" ? "verb"
               : "object";

    const q = tpl.questions?.[role];

    // If template doesn't support this role, try another prompt rather than crashing
    if (!q?.choices?.length) return renderNext(targetLang, supportLang);

    const options = shuffle([...q.choices]);

    content.innerHTML = `
      <p>${tpl.render[targetLang]}</p>
      <p><strong>In this sentence:</strong> ${q.prompt?.[supportLang] || ""}</p>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");

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
      container.appendChild(btn);
    });
  }

  // -------------------------
  // Level 3 – Recognition (with support sentence shown)
  // -------------------------
  function renderRecognitionL3(targetLang, supportLang, tpl, targetConcept) {

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const targetSentence = tpl.render?.[targetLang] || "";
    const supportSentence = tpl.render?.[supportLang] || "";

    const surface = safeSurfaceForConcept(tpl, targetLang, targetConcept);
    const blanked = blankSentence(targetSentence, surface);

    const options = buildRecognitionOptions(tpl, targetConcept, 4);
    if (!options) return renderNext(targetLang, supportLang);

    const subjectCid = (tpl.concepts || []).find(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    content.innerHTML = `
      <p><strong>Original sentence:</strong></p>
      <p>${supportSentence}</p>
      <hr>
      <p><strong>Fill in the missing word:</strong></p>
      <p>${blanked}</p>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");
    const isSentenceStart = blanked.trim().startsWith("_____");

    options.forEach(opt => {

      const m = window.GLOBAL_VOCAB.concepts[opt];
      let text;

      if (m?.type === "verb") {
        text = getVerbForm(opt, subjectCid, targetLang);
      } else {
        text = tpl.surface?.[targetLang]?.[opt] || formOf(targetLang, opt);
      }

      text = isSentenceStart
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : text.charAt(0).toLowerCase() + text.slice(1);

      const btn = document.createElement("button");
      btn.textContent = text;

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      container.appendChild(btn);
    });
  }

  // -------------------------
  // Level 4 – Recognition (no support sentence by default, more options, optional hint)
  // -------------------------
  function renderRecognitionL4(targetLang, supportLang, tpl, targetConcept) {

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const targetSentence = tpl.render?.[targetLang] || "";
    const supportSentence = tpl.render?.[supportLang] || "";

    const surface = safeSurfaceForConcept(tpl, targetLang, targetConcept);
    const blanked = blankSentence(targetSentence, surface);

    // Harder: aim for 6 options when possible (still respects strict distractor rules)
    const options = buildRecognitionOptions(tpl, targetConcept, 6);
    if (!options) return renderNext(targetLang, supportLang);

    const subjectCid = (tpl.concepts || []).find(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    content.innerHTML = `
      <p><strong>Fill in the missing word:</strong></p>
      <p>${blanked}</p>

      <button id="toggle-hint" class="primary small" type="button" style="margin:0.75rem 0;">
        Show hint
      </button>
      <div id="hint" style="display:none;opacity:0.95;">
        <p style="margin-bottom:0.25rem;"><strong>Hint (support sentence):</strong></p>
        <p>${supportSentence}</p>
        <hr>
      </div>

      <div id="choices"></div>
    `;

    const hintBtn = document.getElementById("toggle-hint");
    const hint = document.getElementById("hint");
    hintBtn.onclick = () => {
      const showing = hint.style.display !== "none";
      hint.style.display = showing ? "none" : "block";
      hintBtn.textContent = showing ? "Show hint" : "Hide hint";
    };

    const container = document.getElementById("choices");
    const isSentenceStart = blanked.trim().startsWith("_____");

    options.forEach(opt => {

      const m = window.GLOBAL_VOCAB.concepts[opt];
      let text;

      if (m?.type === "verb") {
        text = getVerbForm(opt, subjectCid, targetLang);
      } else {
        text = tpl.surface?.[targetLang]?.[opt] || formOf(targetLang, opt);
      }

      text = isSentenceStart
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : text.charAt(0).toLowerCase() + text.slice(1);

      const btn = document.createElement("button");
      btn.textContent = text;

      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };

      container.appendChild(btn);
    });
  }

  // -------------------------
  // Next item (with guard to avoid recursive stack blow-ups)
  // -------------------------
  function renderNext(targetLang, supportLang) {
    // Try multiple times to find a renderable item without recursion loops.
    for (let attempts = 0; attempts < 30; attempts++) {
      const tpl = chooseTemplate();
      if (!tpl) {
        content.innerHTML = "All concepts completed.";
        return;
      }

      const targetConcept = determineTargetConcept(tpl);
      const level = levelOf(targetConcept);

      // Level 3/4 need recognition option integrity; if not possible, try again.
      if (level >= 3) {
        const desired = level === 4 ? 6 : 4;
        const opts = buildRecognitionOptions(tpl, targetConcept, desired);
        if (!opts) continue;
      }

      if (level === 1) return renderExposure(targetLang, supportLang, tpl, targetConcept);
      if (level === 2) return renderComprehension(targetLang, supportLang, tpl, targetConcept);
      if (level === 3) return renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);
      return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
    }

    // If we get here, it's almost always: "not enough eligible distractors at currentLevel"
    content.innerHTML = `
      <p><strong>No eligible items right now.</strong></p>
      <p>This usually means the strict distractor rule can't be satisfied yet (needs more concepts at the same level).</p>
    `;
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
