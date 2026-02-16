// Zero to Hero – data-driven learning app
// VERSION: v0.9.2-global-merge+version-badge
//
// Purpose of this version:
// - Global vocab merge (loads all vocab JSON files into one runtime universe)
// - Shows a visible version badge so you can confirm the latest deploy is live
// - Fixes template pronoun correctness check by using tpl.concepts (not tpl.concept_ids)

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.2-global-merge+version-badge";

  // --------------------
  // DOM references (guarded)
  // --------------------
  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");

  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");

  const datasetSel = document.getElementById("dataset");
  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");
  const loadBtn = document.getElementById("load");

  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");

  function mustHave(el, name) {
    if (!el) {
      console.warn(`[app.js] Missing required element: #${name}`);
      return false;
    }
    return true;
  }

  // --------------------
  // Version badge (visible) + console tag
  // --------------------
  function setVersionBadge() {
    // Console
    console.log(`[Zero-to-Hero] app.js ${APP_VERSION}`);

    // Visible: append to session subtitle if present
    if (subtitle) {
      const base = subtitle.textContent || "";
      const tag = ` • ${APP_VERSION}`;
      if (!base.includes(APP_VERSION)) subtitle.textContent = base + tag;
    }

    // Also set the document title suffix for easy tab confirmation
    document.title = document.title.replace(/\s+•\s+v[\w.\-+]+$/i, "");
    document.title += ` • ${APP_VERSION}`;
  }

  setVersionBadge();

  // --------------------
  // GLOBAL MERGE – Load all vocab files
  // --------------------
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

  window.GLOBAL_VOCAB = {
    concepts: {},
    languages: {}
  };

  async function loadAndMergeVocab() {
    for (const file of VOCAB_FILES) {
      try {
        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Merge concepts
        for (const concept of data.concepts || []) {
          window.GLOBAL_VOCAB.concepts[concept.concept_id] = concept;
        }

        // Merge language forms
        for (const [langCode, langData] of Object.entries(data.languages || {})) {
          if (!window.GLOBAL_VOCAB.languages[langCode]) {
            window.GLOBAL_VOCAB.languages[langCode] = {
              label: langData.label,
              forms: {}
            };
          }

          Object.assign(
            window.GLOBAL_VOCAB.languages[langCode].forms,
            langData.forms || {}
          );
        }

      } catch (e) {
        console.error(`Failed to load ${file}`, e);
      }
    }

    console.log("GLOBAL_VOCAB ready:", window.GLOBAL_VOCAB);
  }

  // --------------------
  // App entry / exit
  // --------------------
  if (openAppBtn && startScreen && learningScreen) {
    openAppBtn.addEventListener("click", async () => {
      startScreen.classList.remove("active");
      learningScreen.classList.add("active");

      const tl = targetSel?.value || "pt";
      const sl = supportSel?.value || "en";

      await loadAndMergeVocab();
      await loadStage1Comprehension(tl, sl);
    });
  } else {
    mustHave(openAppBtn, "open-app");
    mustHave(startScreen, "start-screen");
    mustHave(learningScreen, "learning-screen");
  }

  if (quitBtn && startScreen && learningScreen) {
    quitBtn.addEventListener("click", () => {
      learningScreen.classList.remove("active");
      startScreen.classList.add("active");
    });
  } else {
    mustHave(quitBtn, "quit-learning");
  }

  // --------------------
  // Dataset viewer (dev / later use)
  // --------------------
  if (loadBtn) {
    loadBtn.addEventListener("click", async () => {
      const file = datasetSel?.value || "verbs.json";
      const tl = targetSel?.value || "pt";
      const sl = supportSel?.value || "en";
      await renderDataset(file, tl, sl);
    });
  } else {
    mustHave(loadBtn, "load");
  }

  async function renderDataset(file, targetLang, supportLang) {
    if (!mustHave(subtitle, "session-subtitle") || !mustHave(content, "content")) return;

    subtitle.textContent = `Showing: ${String(file).replace(".json", "")} | Target: ${String(targetLang).toUpperCase()} | Support: ${String(supportLang).toUpperCase()} • ${APP_VERSION}`;
    content.innerHTML = "Loading...";

    let data;
    try {
      const res = await fetch(file, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      content.innerHTML = `Could not load <strong>${escapeHtml(file)}</strong>. Make sure it exists.`;
      return;
    }

    const tPack = data.languages?.[targetLang];
    const sPack = data.languages?.[supportLang];
    if (!tPack || !sPack) {
      const available = Object.keys(data.languages || {}).join(", ");
      content.innerHTML = `Language missing in ${escapeHtml(file)}. Available: ${escapeHtml(available)}`;
      return;
    }

    content.innerHTML = "";
    for (const concept of data.concepts || []) {
      const t = tPack.forms?.[concept.concept_id] || [];
      const s = sPack.forms?.[concept.concept_id] || [];

      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <strong>${escapeHtml(concept.concept_id)}</strong>
        <div class="forms">${escapeHtml(t.join(", "))} — ${escapeHtml(s.join(", "))}</div>
      `;
      content.appendChild(row);
    }
  }

  // --------------------
  // Stage 1 – Sentence comprehension
  // --------------------
  async function loadStage1Comprehension(targetLang, supportLang) {
    if (!mustHave(subtitle, "session-subtitle") || !mustHave(content, "content")) return;

    subtitle.textContent = `Read and understand • ${APP_VERSION}`;
    content.innerHTML = "Loading sentence...";

    let data;
    try {
      const res = await fetch("sentence_templates.json", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch (e) {
      content.innerHTML = "Could not load sentence templates.";
      return;
    }

    // For now: always first template
    const tpl = data.templates?.[0];
    if (!tpl) {
      content.innerHTML = "No templates found.";
      return;
    }

    const sentence = tpl.render?.[targetLang] || "";
    const questionText = buildWhoQuestionFromSupportSentence(tpl, supportLang);

    // All singular pronouns from vocab
const allPronouns = Object.keys(window.GLOBAL_VOCAB.concepts)
  .filter(id => id.includes("PERSON") && id.includes("SINGULAR"));

// Determine correct pronoun from template
const correct = (tpl.concepts || [])
  .find(id => allPronouns.includes(id));

// Build distractors
const distractors = allPronouns
  .filter(id => id !== correct)
  .sort(() => Math.random() - 0.5)
  .slice(0, 2);

// Combine + shuffle
const options = [correct, ...distractors]
  .sort(() => Math.random() - 0.5);

    content.innerHTML = `
      <div class="row">
        <strong>Read and understand</strong>
        <div class="forms" style="font-size:1.2rem;margin:0.5rem 0 0.75rem;">
          ${escapeHtml(sentence)}
        </div>
        <div class="forms">${escapeHtml(questionText)}</div>

        <div id="choices" style="margin-top:0.75rem;display:flex;gap:10px;flex-wrap:wrap;"></div>
      </div>
    `;

    const choicesDiv = document.getElementById("choices");
    if (!choicesDiv) return;

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "secondary small";
      btn.type = "button";
      btn.textContent = pronounLabel(opt, supportLang);

      btn.onclick = () => {
        [...choicesDiv.children].forEach(b => (b.disabled = true));

        const ok = opt === correct;
        btn.textContent += ok ? " ✓" : " ✕";
      };

      choicesDiv.appendChild(btn);
    });
  }

  // --------------------
  // Helpers
  // --------------------
  function buildWhoQuestionFromSupportSentence(tpl, supportLang) {
    const supportSentence = tpl.render?.[supportLang];
    if (!supportSentence) return "Who?";

    switch (supportLang) {
      case "en":
        return whoFromSvoSentence(supportSentence, "Who");
      case "pt":
        return whoFromSvoSentence(supportSentence, "Quem");
      case "ja":
        return whoFromJapaneseSentence(supportSentence);
      default:
        return whoFromSvoSentence(supportSentence, "Who");
    }
  }

  function whoFromSvoSentence(sentence, whoWord) {
    let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");
    const parts = clean.split(/\s+/);
    if (parts.length < 2) return `${whoWord}?`;
    parts[0] = whoWord;
    return `${parts.join(" ")}?`;
  }

  function whoFromJapaneseSentence(sentence) {
    let clean = String(sentence).trim().replace(/[.!?。！？]$/, "");

    const idxWa = clean.indexOf("は");
    const idxGa = clean.indexOf("が");
    let cutIdx = -1;

    if (idxWa !== -1 && (idxGa === -1 || idxWa < idxGa)) cutIdx = idxWa;
    if (idxGa !== -1 && (idxWa === -1 || idxGa < idxWa)) cutIdx = idxGa;

    if (cutIdx !== -1) {
      clean = clean.slice(cutIdx + 1).trim();
    }

    return `誰が${clean}？`;
  }

  function pronounLabel(conceptId, lang) {
    const map = {
      FIRST_PERSON_SINGULAR: { en: "I", pt: "eu", ja: "私" },
      SECOND_PERSON: { en: "you", pt: "você", ja: "あなた" },
      THIRD_PERSON_SINGULAR: { en: "he / she", pt: "ele / ela", ja: "彼 / 彼女" }
    };
    return map[conceptId]?.[lang] || conceptId;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

});
