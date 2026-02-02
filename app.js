// app.js — Stage 1 stable + Stage 2 (Exercise 5) slot demo
// This patch fixes:
// 1) Choice labels: show actual target-language words (not concept IDs) for pronouns / verbs
// 2) Slot sentence format: "Ele/ela ____ comida. (eats)"
// 3) Verb option surface: show 3sg present where possible (e.g., "come" not "comer")

// --------------------
// DOM references
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

// --------------------
// External links (placeholders)
// --------------------
document.getElementById("link-blueprint").href = "#";
document.getElementById("link-skool").href = "#";
document.getElementById("link-coaching").href = "#";

// --------------------
// SAFE user bootstrap (does not block UI)
// --------------------
try {
  if (window.UserState?.ensureUser) {
    const u = window.UserState.ensureUser();
    window.__USER__ = u;
    window.__RUN__ = u.runs[u.current_run_id];
  }
} catch (e) {
  console.warn("[UserState] init failed, continuing without persistence.", e);
}

// --------------------
// App entry / exit
// --------------------
openAppBtn.addEventListener("click", async () => {
  startScreen.classList.remove("active");
  learningScreen.classList.add("active");

  // For now, demo Exercise 5 directly (Stage 2 slot-based)
  await loadStage2SlotExercise(targetSel.value, supportSel.value);
});

quitBtn.addEventListener("click", () => {
  learningScreen.classList.remove("active");
  startScreen.classList.add("active");
});

// --------------------
// Dataset viewer (dev / later use)
// --------------------
loadBtn.addEventListener("click", async () => {
  // Keep LOAD button for quick re-roll / debugging
  await loadStage2SlotExercise(targetSel.value, supportSel.value);
});

// --------------------
// Stage 2 — Exercise 5 (slot-based, choices)
// --------------------
async function loadStage2SlotExercise(targetLang, supportLang) {
  subtitle.textContent = "Choose the missing word";
  content.innerHTML = "Loading...";

  // Load sentence templates
  let tplData;
  try {
    const res = await fetch("sentence_templates.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    tplData = await res.json();
  } catch (e) {
    content.innerHTML = "Could not load sentence templates.";
    return;
  }

  // Expose for scheduler/debug
  window.SENTENCE_TEMPLATES = tplData.templates;

  // Load verbs + pronouns + nouns (for display)
  const [verbs, pronouns, nouns] = await Promise.all([
    safeLoadJson("verbs.json"),
    safeLoadJson("pronouns.json"),
    safeLoadJson("nouns.json"),
  ]);

  if (!verbs || !pronouns || !nouns) {
    content.innerHTML = "Could not load vocab packs.";
    return;
  }

  // Build a minimal vocab index (concept_id -> meta + forms)
  const vocabIndex = buildVocabIndex([verbs, pronouns, nouns]);
  window.VOCAB_INDEX = vocabIndex;

  // For now: use the first template (your existing PRON_EAT_FOOD)
  const tpl = tplData.templates[0];

  // We want: Ele/ela ____ comida. (eats)
  // So: mask the VERB concept in position 1 (concepts: PRONOUN, EAT, FOOD)
  const maskConcept = tpl.concepts[1]; // EAT
  const sentenceTarget = tpl.render[targetLang] || "";
  const sentenceSupport = tpl.render[supportLang] || "";

  const targetTokens = tokenizeLatinSentence(sentenceTarget);
  const supportTokens = tokenizeLatinSentence(sentenceSupport);

  // Get the verb surface from the sentence render (handles "come" vs "comer")
  const targetVerbSurface = (targetTokens[1]?.clean || "") || lookupAnyForm(vocabIndex, maskConcept, targetLang);
  const supportVerbSurface = (supportTokens[1]?.clean || "") || lookupAnyForm(vocabIndex, maskConcept, supportLang);

  // Render pronoun as "Ele/ela" (or language-appropriate)
  const pronounSurface = renderPronounCombo(targetLang);

  // Render noun surface from sentence (keeps punctuation)
  const nounSurface = (targetTokens[2]?.raw || "").replace(/[.!?。！？]$/, "");

  const hint = supportVerbSurface ? ` (${escapeHtml(supportVerbSurface)})` : "";

  content.innerHTML = `
    <div class="row">
      <div class="forms" style="font-size:1.4rem;margin:0.25rem 0 0.75rem;">
        ${escapeHtml(pronounSurface)} _____ ${escapeHtml(nounSurface)}.${hint}
      </div>
      <div id="choices"></div>
    </div>
  `;

  // Choices: correct + 3 distractor verbs
  const choicesDiv = document.getElementById("choices");

  const distractors = pickVerbDistractors(vocabIndex, maskConcept, targetLang, 3);

  // Convert all choices to 3sg present (PT/EN) when possible
  const choiceItems = [
    { concept_id: maskConcept, label: targetVerbSurface, correct: true },
    ...distractors.map(cid => ({
      concept_id: cid,
      label: verbChoiceSurface(vocabIndex, cid, targetLang, targetVerbSurface),
      correct: false
    }))
  ];

  // Shuffle
  shuffleInPlace(choiceItems);

  for (const item of choiceItems) {
    const btn = document.createElement("button");
    btn.className = "primary small";
    btn.style.marginRight = "0.5rem";
    btn.style.marginBottom = "0.5rem";
    btn.textContent = item.label || item.concept_id;

    btn.onclick = () => {
      // Basic feedback
      if (item.correct) {
        btn.textContent = `${btn.textContent} ✓`;
        bumpStage2(maskConcept, true);
      } else {
        btn.textContent = `${btn.textContent} ✕`;
        bumpStage2(maskConcept, false);
      }
    };

    choicesDiv.appendChild(btn);
  }
}

// --------------------
// Progress updates (localStorage via UserState if available)
// --------------------
function bumpStage2(conceptId, isCorrect) {
  try {
    const user = window.__USER__;
    const run = window.__RUN__;
    if (!user || !run) return;

    const p = run.concept_progress[conceptId] || { seen_stage1: 3, stage2_attempts: 0, stage2_correct: 0, last_seen: Date.now() };
    p.stage2_attempts += 1;
    if (isCorrect) p.stage2_correct += 1;
    p.last_seen = Date.now();
    run.concept_progress[conceptId] = p;

    if (window.UserState?.saveUser) window.UserState.saveUser(user);
  } catch (e) {
    // Never let progress code break UI
    console.warn("Progress update failed:", e);
  }
}

// --------------------
// Vocab helpers
// --------------------
function buildVocabIndex(packs) {
  const index = {};
  for (const pack of packs) {
    const concepts = pack.concepts || [];
    const languages = pack.languages || {};
    for (const c of concepts) {
      const id = c.concept_id;
      if (!index[id]) index[id] = { concept: c, forms: {} };

      // interaction_profile is where sentence_use sits in your vocab packs
      if (c.interaction_profile) {
        index[id].interaction_profile = c.interaction_profile;
      }

      for (const [lang, langPack] of Object.entries(languages)) {
        const forms = langPack.forms?.[id] || [];
        if (!index[id].forms[lang]) index[id].forms[lang] = forms;
      }
    }
  }
  return index;
}

function lookupAnyForm(vocabIndex, conceptId, lang) {
  const forms = vocabIndex?.[conceptId]?.forms?.[lang];
  return Array.isArray(forms) && forms.length ? forms[0] : "";
}

// --------------------
// Choice surface logic
// --------------------
function pickVerbDistractors(vocabIndex, correctConceptId, targetLang, n) {
  // Pull from verbs.json concepts only, but we can approximate by filtering semantic_role/type
  const all = Object.keys(vocabIndex).filter(cid => {
    const c = vocabIndex[cid]?.concept;
    if (!c) return false;
    if (c.type !== "verb") return false;
    if (cid === correctConceptId) return false;
    const allowed = vocabIndex[cid]?.interaction_profile?.sentence_use !== false;
    return allowed;
  });

  shuffleInPlace(all);
  return all.slice(0, n);
}

function verbChoiceSurface(vocabIndex, conceptId, targetLang, correctSurface) {
  // Try to show a 3sg present surface for PT/EN using small curated map.
  const base = lookupAnyForm(vocabIndex, conceptId, targetLang);
  if (!base) return conceptId;

  // If we have the correct surface from template ("come"), we should convert distractors to same style.
  // For PT, we map infinitive -> 3sg present for a small core set.
  if (targetLang === "pt") {
    const pt = {
      // core irregulars / common
      "comer": "come",
      "ler": "lê",
      "ver": "vê",
      "ir": "vai",
      "ter": "tem",
      "ser": "é",
      "estar": "está",
      "fazer": "faz",
      "dizer": "diz",
      "poder": "pode",
      "querer": "quer",
    };
    return pt[base] || base;
  }

  if (targetLang === "en") {
    // Minimal 3sg present for English (very light heuristic).
    if (base === "be") return "is";
    if (base === "have") return "has";
    if (base.endsWith("y") && !/[aeiou]y$/.test(base)) return base.slice(0, -1) + "ies";
    if (/(s|sh|ch|x|z)$/.test(base)) return base + "es";
    return base + "s";
  }

  // For other languages, just show the base form for now.
  return base;
}

function renderPronounCombo(targetLang) {
  // You asked specifically for "Ele/ela" here.
  // For other target languages, we use safe equivalents.
  switch (targetLang) {
    case "pt": return "Ele/ela";
    case "en": return "He/she";
    case "ja": return "彼/彼女";
    default: return "He/she";
  }
}

// --------------------
// Tokenization (PT/EN style)
// --------------------
function tokenizeLatinSentence(sentence) {
  const clean = String(sentence).trim();
  const parts = clean.split(/\s+/);
  return parts.map(p => {
    const raw = p;
    const cleanToken = p.replace(/[.!?]$/, "");
    return { raw, clean: cleanToken };
  });
}

async function safeLoadJson(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
