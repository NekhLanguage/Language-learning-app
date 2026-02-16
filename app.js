// Zero to Hero – data-driven learning app
// VERSION: v0.9.3-pronoun-metadata-engine

document.addEventListener("DOMContentLoaded", () => {

  const APP_VERSION = "v0.9.3-pronoun-metadata-engine";

  // --------------------
  // DOM references
  // --------------------
  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");

  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");

  const targetSel = document.getElementById("targetLang");
  const supportSel = document.getElementById("supportLang");

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
  // Version badge
  // --------------------
  function setVersionBadge() {
    console.log(`[Zero-to-Hero] app.js ${APP_VERSION}`);

    if (subtitle) {
      subtitle.textContent = `${subtitle.textContent || ""} • ${APP_VERSION}`;
    }

    document.title = document.title.replace(/\s+•\s+v[\w.\-+]+$/i, "");
    document.title += ` • ${APP_VERSION}`;
  }

  setVersionBadge();

  // --------------------
  // GLOBAL MERGE
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

        for (const concept of data.concepts || []) {
          window.GLOBAL_VOCAB.concepts[concept.concept_id] = concept;
        }

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
  // App entry
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
  }

  if (quitBtn && startScreen && learningScreen) {
    quitBtn.addEventListener("click", () => {
      learningScreen.classList.remove("active");
      startScreen.classList.add("active");
    });
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

    const tpl = data.templates?.[0];
    if (!tpl) {
      content.innerHTML = "No templates found.";
      return;
    }

    const sentence = tpl.render?.[targetLang] || "";
    const questionText = buildWhoQuestionFromSupportSentence(tpl, supportLang);

    const allPronouns = Object.entries(window.GLOBAL_VOCAB.concepts)
      .filter(([_, concept]) => concept.type === "pronoun")
      .map(([id]) => id);

    const correct = (tpl.concepts || [])
      .find(id => allPronouns.includes(id));

    if (!correct) {
      console.warn("No pronoun found in template concepts.");
      content.innerHTML = "Template missing pronoun concept.";
      return;
    }

    const distractors = allPronouns
      .filter(id => id !== correct)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

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
      case "en": return whoFromSvoSentence(supportSentence, "Who");
      case "pt": return whoFromSvoSentence(supportSentence, "Quem");
      case "ja": return whoFromJapaneseSentence(supportSentence);
      default: return whoFromSvoSentence(supportSentence, "Who");
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

    if (cutIdx !== -1) clean = clean.slice(cutIdx + 1).trim();

    return `誰が${clean}？`;
  }

  function pronounLabel(conceptId, lang) {
    const map = {
      FIRST_PERSON_SINGULAR: { en: "I", pt: "eu", ja: "私" },
      SECOND_PERSON: { en: "you", pt: "você", ja: "あなた" },
      THIRD_PERSON_SINGULAR: { en: "he / she", pt: "ele / ela", ja: "彼 / 彼女" },
      FIRST_PERSON_PLURAL: { en: "we", pt: "nós", ja: "私たち" },
      THIRD_PERSON_PLURAL: { en: "they", pt: "eles / elas", ja: "彼ら / 彼女ら" }
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
