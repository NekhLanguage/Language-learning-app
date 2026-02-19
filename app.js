// Zero to Hero – Strict Ladder + Dynamic Verb Conjugation
// VERSION: v0.9.41-level4-devstart

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.41-level4";
  const MAX_LEVEL = 5;
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
      completed: false,
      lastShownAt: -Infinity,
      lastResult: null
    };
  }
  return run.progress[cid];
}
function passesSpacingRule(cid) {

  const state = ensureProgress(cid);
  const level = state.level;
  const currentIndex = run.exerciseCounter;

  if (state.lastShownAt === -Infinity) return true;

  const distance = currentIndex - state.lastShownAt;

  // LEVEL 1 → always treated as correct
  if (level === 1) {
    return distance >= 4;
  }

  // LEVEL 7 special rule
  if (level === 7) {
    if (state.lastResult === false) {
      return distance >= 2;
    } else {
      return distance >= 20;
    }
  }

  // Normal levels (2–6)
  if (state.lastResult === false) {
    return distance >= 2;
  } else {
    return distance >= 4;
  }
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
  progress: {},
  exerciseCounter: 0
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

  // 🔒 Spacing tracking (must happen for both correct and incorrect)
  state.lastShownAt = run.exerciseCounter;
  state.lastResult = correct;

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
  // Level 4 – Isolated Translation Recall
  // (ONLY CHANGED SECTION)
  // -------------------------
  function renderRecognitionL4(targetLang, supportLang, tpl, targetConcept) {

    // Level 4 = Isolated Translation Recall
    // Prompt in support language, options in target language (verbs use base form).
    // Does NOT change ladder rules or global option-builder behavior.

    subtitle.textContent = "Level " + levelOf(targetConcept);

    const promptSupport = formOf(supportLang, targetConcept);

    function resolveTargetSurface(cid) {
  const entry = window.GLOBAL_VOCAB.languages?.[targetLang]?.forms?.[cid];
  const meta = window.GLOBAL_VOCAB.concepts[cid];

  if (entry === undefined || entry === null) return cid;

  // VERBS → strictly base / infinitive only
  if (meta?.type === "verb") {
    if (typeof entry === "object") {
      if (typeof entry.base === "string") return entry.base;
      if (typeof entry.infinitive === "string") return entry.infinitive;
    }
    if (typeof entry === "string") return entry;
    return cid; // do NOT fallback to random conjugation
  }

  // NON-VERBS
  if (typeof entry === "string") return entry;

  if (Array.isArray(entry)) return entry[0];

  if (typeof entry === "object") {
    const firstString = Object.values(entry).find(v => typeof v === "string");
    if (firstString) return firstString;
  }

  return cid;
}

    function buildLevel4Options() {
      const currentLevel = levelOf(targetConcept);
      const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
      if (!meta) return null;

      // Pool rules = identical to buildRecognitionOptions:
      // same type, released, not completed, and level >= currentLevel
      // PLUS: exclude concepts with the same support-surface as the prompt
      //       and enforce unique support-surfaces among distractors.
      const pool = run.released.filter(cid => {
        if (cid === targetConcept) return false;

        const st = ensureProgress(cid);
        if (st.completed) return false;
        if (st.level < currentLevel) return false;

        const m = window.GLOBAL_VOCAB.concepts[cid];
        if (!m || m.type !== meta.type) return false;

        const otherSupport = formOf(supportLang, cid);
        if (otherSupport === promptSupport) return false; // prevents você/vocês together for "you"

        return true;
      });

      if (pool.length < 3) return null;

      // Try to build up to 6 options, but always >= 4
      const desiredTotal = Math.max(4, Math.min(6, pool.length + 1));

      // Shuffle pool and pick distractors with unique support meanings
      const shuffled = shuffle([...pool]);
      const chosen = [targetConcept];
      const usedSupport = new Set([promptSupport]);

      for (const cid of shuffled) {
        if (chosen.length >= desiredTotal) break;

        const s = formOf(supportLang, cid);
        if (usedSupport.has(s)) continue;

        usedSupport.add(s);
        chosen.push(cid);
      }

      // If we couldn't reach 4 options with uniqueness, fall back to strict builder
      // (still respects ladder rules; only loses the "no duplicate meaning" nicety).
      if (chosen.length < 4) {
        return buildRecognitionOptions(tpl, targetConcept, 6);
      }

      return shuffle(chosen);
    }

    const options = buildLevel4Options();
    if (!options) return renderNext(targetLang, supportLang);

    content.innerHTML = `
      <p>Choose the correct translation for:</p>
      <h2>${promptSupport}</h2>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.textContent = resolveTargetSurface(opt);

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
// Level 5 – Matching (Wire Style)
// -------------------------
function renderMatchingL5(targetLang, supportLang) {

  subtitle.textContent = "Level 5";

  // Gather eligible concepts
  const eligible = run.released.filter(cid => {
    const st = ensureProgress(cid);
    return (
      st.level === 5 &&
      !st.completed &&
      passesSpacingRule(cid)
    );
  });

  if (eligible.length < 4) {
  return renderNext(targetLang, supportLang);
}

  // Shuffle and take max 5
  const shuffled = shuffle([...eligible]);
  const selected = shuffled.slice(0, Math.min(5, shuffled.length));

  // Build left (support) and right (target) columns
  const leftItems = shuffle([...selected]);
  const rightItems = shuffle([...selected]);

  const selectedPairs = new Map();

  content.innerHTML = `
  <div id="matching-container" style="
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:60px;
    margin-top:20px;
  ">
    <div id="left-column" style="display:flex;flex-direction:column;gap:15px;"></div>
    <div id="right-column" style="display:flex;flex-direction:column;gap:15px;"></div>
  </div>
  <div style="margin-top:30px;text-align:center;">
    <button id="check-matches">Check</button>
  </div>
`;

  const leftColumn = document.getElementById("left-column");
  const rightColumn = document.getElementById("right-column");

  let activeSelection = null;

  function createButton(cid, side) {
  const btn = document.createElement("button");
  btn.textContent = side === "left"
    ? formOf(supportLang, cid)
    : resolveTargetSurface(cid);

  btn.dataset.cid = cid;
  btn.dataset.side = side;

  btn.onclick = () => {

    // Ignore clicks on already matched buttons
    if (btn.classList.contains("matched")) return;

    if (!activeSelection) {
      activeSelection = btn;
      btn.classList.add("selected");
      return;
    }

    // Clicking same button deselects it
    if (activeSelection === btn) {
      btn.classList.remove("selected");
      activeSelection = null;
      return;
    }

    // Clicking same side switches selection
    if (activeSelection.dataset.side === btn.dataset.side) {
      activeSelection.classList.remove("selected");
      activeSelection = btn;
      btn.classList.add("selected");
      return;
    }

    // Opposite side → attempt pairing
    const leftBtn = activeSelection.dataset.side === "left" ? activeSelection : btn;
    const rightBtn = activeSelection.dataset.side === "right" ? activeSelection : btn;

    selectedPairs.set(leftBtn.dataset.cid, rightBtn.dataset.cid);

    leftBtn.classList.remove("selected");
    rightBtn.classList.remove("selected");

    leftBtn.classList.add("paired");
    rightBtn.classList.add("paired");

    activeSelection = null;
  };

  return btn;
}


  function resolveTargetSurface(cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[targetLang]?.forms?.[cid];
    const meta = window.GLOBAL_VOCAB.concepts[cid];

    if (!entry) return cid;

    if (meta?.type === "verb") {
      if (typeof entry === "object") {
        if (entry.base) return entry.base;
        if (entry.infinitive) return entry.infinitive;
      }
      if (typeof entry === "string") return entry;
      return cid;
    }

    if (typeof entry === "string") return entry;
    if (Array.isArray(entry)) return entry[0];
    if (typeof entry === "object") {
      const first = Object.values(entry).find(v => typeof v === "string");
      if (first) return first;
    }

    return cid;
  }

  leftItems.forEach(cid => {
    leftColumn.appendChild(createButton(cid, "left"));
  });

  rightItems.forEach(cid => {
    rightColumn.appendChild(createButton(cid, "right"));
  });

  document.getElementById("check-matches").onclick = () => {

  let allCorrect = true;

  selected.forEach(cid => {
    const matched = selectedPairs.get(cid);

    const leftBtn = [...leftColumn.children].find(b => b.dataset.cid === cid);
    const rightBtn = [...rightColumn.children].find(b => b.dataset.cid === matched);

    if (matched === cid) {
      leftBtn.classList.add("matched");
      rightBtn.classList.add("matched");
      applyResult(cid, true);
    } else {
      allCorrect = false;

      if (leftBtn) leftBtn.classList.add("wrong");
      if (rightBtn) rightBtn.classList.add("wrong");

      applyResult(cid, false);
    }
  });

  if (allCorrect) {
    setTimeout(() => {
      renderNext(targetLang, supportLang);
    }, 800);
  } else {
    setTimeout(() => {
      renderMatchingL5(targetLang, supportLang);
    }, 1000);
  }
  };
}

  // -------------------------
  // Next item (with guard to avoid recursive stack blow-ups)
  // -------------------------
  function renderNext(targetLang, supportLang) {
  run.exerciseCounter++;
  for (let attempts = 0; attempts < 30; attempts++) {
      const tpl = chooseTemplate();
      if (!tpl) {
        content.innerHTML = "All concepts completed.";
        return;
      }

      const targetConcept = determineTargetConcept(tpl);
      if (!passesSpacingRule(targetConcept)) {
      continue;
      }
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
      if (level === 4) return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
      if (level === 5) return renderMatchingL5(targetLang, supportLang);

// Fallback safeguard (should never trigger if ladder is correct)
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
