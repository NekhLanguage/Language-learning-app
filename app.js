// Zero to Hero – Template-Driven Blueprint Engine (stabilized)
// VERSION: v0.9.8-template-scheduler-stable
//
// Fixes vs prior version:
// - Never assumes run.progress[cid] exists (lazy init everywhere)
// - Template eligibility checks initialize missing concept progress
// - Safe level lookups (no undefined.level crash)
// - Keeps template-driven scheduler (templates are the unit of scheduling)
// - Keeps release queue (start 5, release +1 when a target concept reaches level 3)
// - Uses template.render for now (pattern generation comes next)

document.addEventListener("DOMContentLoaded", () => {
  const APP_VERSION = "v0.9.8-template-scheduler-stable";

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  console.log(`[Zero-to-Hero] ${APP_VERSION}`);
  document.title = (document.title || "Zero-to-Hero").replace(/\s+•\s+v[\w.\-+]+$/i, "");
  document.title += ` • ${APP_VERSION}`;

  // ---------------- GLOBAL MERGE ----------------

  const VOCAB_FILES = [
    "adjectives.json",
    "connectors.json",
    "directions_positions.json",
    "glue_words.json",
    "nouns.json",
    "numbers.json",
    "politeness_modality.json",
    "pronouns.json",
    "quantifiers.json",
    "question_words.json",
    "time_words.json",
    "verbs.json"
  ];

  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

  async function loadAndMergeVocab() {
    window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

    for (const file of VOCAB_FILES) {
      try {
        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      } catch (e) {
        console.error(`Failed to load ${file}`, e);
      }
    }

    console.log("GLOBAL_VOCAB ready:", {
      concepts: Object.keys(window.GLOBAL_VOCAB.concepts).length,
      languages: Object.keys(window.GLOBAL_VOCAB.languages).length
    });
  }

  // ---------------- TEMPLATE CACHE ----------------

  let TEMPLATE_CACHE = null;

  async function loadTemplates() {
    if (TEMPLATE_CACHE) return TEMPLATE_CACHE;

    try {
      const res = await fetch("sentence_templates.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      TEMPLATE_CACHE = data.templates || [];
      console.log("Templates loaded:", TEMPLATE_CACHE.length);
      return TEMPLATE_CACHE;
    } catch (e) {
      console.error("Failed to load sentence_templates.json", e);
      TEMPLATE_CACHE = [];
      return TEMPLATE_CACHE;
    }
  }

  // ---------------- RUN STATE ----------------

  let run = null;

  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      if (!seen.has(x)) { seen.add(x); out.push(x); }
    }
    return out;
  }

  function ensureProgress(cid) {
    if (!run.progress[cid]) {
      run.progress[cid] = { level: 1, streak: 0 };
    }
    return run.progress[cid];
  }

  function levelOf(cid) {
    return ensureProgress(cid).level;
  }

  function initRunFromTemplates() {
    const conceptsInTemplates = uniq((TEMPLATE_CACHE || []).flatMap(t => (t.concepts || [])))
      .filter(cid => !!window.GLOBAL_VOCAB.concepts[cid]);

    run = {
      released: [],
      future: [...conceptsInTemplates],
      progress: {},     // cid -> { level, streak }
      lastTemplateId: null
    };

    releaseConcepts(5);
  }

  function releaseConcepts(n) {
    for (let i = 0; i < n && run.future.length > 0; i++) {
      const cid = run.future.shift();
      if (!run.released.includes(cid)) run.released.push(cid);
      ensureProgress(cid);
    }
  }

  // ---------------- TEMPLATE-DRIVEN SCHEDULER ----------------

  function templateEligible(tpl) {
    const concepts = tpl.concepts || [];
    // Eligible only if all concepts in template are released.
    // Also ensure progress exists for each (stability).
    for (const cid of concepts) {
      if (!run.released.includes(cid)) return false;
      ensureProgress(cid);
    }
    return true;
  }

  function chooseTemplate() {
    const eligible = (TEMPLATE_CACHE || []).filter(templateEligible);
    if (eligible.length === 0) return null;

    // Avoid repeating same template back-to-back if possible
    let pool = eligible;
    if (run.lastTemplateId) {
      const alt = eligible.filter(t => (t.template_id || t.pattern_id || "") !== run.lastTemplateId);
      if (alt.length > 0) pool = alt;
    }

    // Score by minimum level among its concepts (prefer templates containing the weakest concept)
    let best = pool[0];
    let bestMin = Infinity;

    for (const tpl of pool) {
      const minLvl = Math.min(...(tpl.concepts || []).map(levelOf));
      if (minLvl < bestMin) {
        bestMin = minLvl;
        best = tpl;
      }
    }

    return best;
  }

  function determineTargetConcept(tpl) {
    // Target = concept with lowest level inside template.
    // Tie-breaker: first in tpl.concepts order.
    let bestCid = null;
    let bestLvl = Infinity;

    for (const cid of (tpl.concepts || [])) {
      const lvl = levelOf(cid);
      if (lvl < bestLvl) {
        bestLvl = lvl;
        bestCid = cid;
      }
    }

    return bestCid;
  }

  // ---------------- PROGRESSION ----------------

  function applyResult(targetCid, correct) {
    const state = ensureProgress(targetCid);

    if (!correct) {
      state.streak = 0;
      return;
    }

    state.streak += 1;

    if (state.streak >= 2) {
      state.level += 1;
      state.streak = 0;

      // Release pacing: when a target reaches level 3, release 1 new concept
      if (state.level === 3) {
        releaseConcepts(1);
      }
    }
  }

  // ---------------- FORMS / LABELS ----------------

  function metaOf(cid) {
    return window.GLOBAL_VOCAB.concepts[cid] || {};
  }

  function formOf(lang, cid) {
    const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
    if (!entry) return cid;
    if (Array.isArray(entry)) return entry[0] || cid;
    if (typeof entry === "object") {
      // For now we keep pronouns etc. as arrays; this is just safe fallback.
      if (typeof entry.default === "string") return entry.default;
    }
    return cid;
  }

  // ---------------- RENDER ----------------

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function renderNext(targetLang, supportLang) {
    if (!content || !subtitle) return;

    const tpl = chooseTemplate();
    if (!tpl) {
      subtitle.textContent = `No available templates • ${APP_VERSION}`;
      content.innerHTML = `<div class="row">No eligible templates yet. (A template is eligible only when all of its concepts are released.)</div>`;
      return;
    }

    run.lastTemplateId = tpl.template_id || tpl.pattern_id || null;

    const targetCid = determineTargetConcept(tpl);
    const targetLevel = levelOf(targetCid);

    const sentence = tpl.render?.[targetLang] || "[Missing render]";

    // For now Stage 1/3: pronoun question if a pronoun exists in template.
    const pronouns = Object.entries(window.GLOBAL_VOCAB.concepts)
      .filter(([_, c]) => c.type === "pronoun")
      .map(([id]) => id);

    const correctPronoun = (tpl.concepts || []).find(cid => pronouns.includes(cid));

    subtitle.textContent = `Exercise 3 • Target ${escapeHtml(targetCid)} (L${targetLevel}) • ${APP_VERSION}`;

    if (!correctPronoun) {
      content.innerHTML = `<div class="row">
        <div class="forms">${escapeHtml(sentence)}</div>
        <div class="forms" style="margin-top:0.75rem;">No pronoun in template; cannot quiz pronoun yet.</div>
        <button id="next-btn" class="secondary small" type="button" style="margin-top:0.75rem;">Continue</button>
      </div>`;
      document.getElementById("next-btn")?.addEventListener("click", () => renderNext(targetLang, supportLang));
      return;
    }

    // Distractors: prefer same number if metadata exists
    const correctMeta = metaOf(correctPronoun);
    const pool = pronouns.filter(pid => {
      const m = metaOf(pid);
      if (!correctMeta.number || !m.number) return true;
      return m.number === correctMeta.number;
    });

    const distractorPool = pool.filter(pid => pid !== correctPronoun);
    const distractors = shuffle(distractorPool).slice(0, 2);
    const options = shuffle([correctPronoun, ...distractors]);

    content.innerHTML = `<div class="row">
      <strong>Read and understand</strong>
      <div class="forms" style="font-size:1.2rem;margin:0.5rem 0 0.75rem;">
        ${escapeHtml(sentence)}
      </div>
      <div class="forms">${supportLang === "pt" ? "Quem?" : "Who?"}</div>
      <div id="choices" style="margin-top:0.75rem;display:flex;gap:10px;flex-wrap:wrap;"></div>
      <div class="forms" style="margin-top:0.75rem;opacity:0.8;font-size:0.9rem;">
        Released: ${run.released.length} • Future: ${run.future.length}
      </div>
    </div>`;

    const choicesDiv = document.getElementById("choices");
    if (!choicesDiv) return;

    options.forEach(optCid => {
      const btn = document.createElement("button");
      btn.className = "secondary small";
      btn.type = "button";
      btn.textContent = formOf(supportLang, optCid);

      btn.onclick = () => {
        // Disable buttons
        [...choicesDiv.children].forEach(b => (b.disabled = true));

        const ok = optCid === correctPronoun;
        btn.textContent += ok ? " ✓" : " ✕";

        applyResult(targetCid, ok);

        setTimeout(() => renderNext(targetLang, supportLang), 150);
      };

      choicesDiv.appendChild(btn);
    });
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------- ENTRY ----------------

  openAppBtn?.addEventListener("click", async () => {
    startScreen?.classList.remove("active");
    learningScreen?.classList.add("active");

    const tl = targetSel?.value || "pt";
    const sl = supportSel?.value || "en";

    await loadAndMergeVocab();
    await loadTemplates();
    initRunFromTemplates();
    renderNext(tl, sl);
  });

  quitBtn?.addEventListener("click", () => {
    learningScreen?.classList.remove("active");
    startScreen?.classList.add("active");
  });
});
