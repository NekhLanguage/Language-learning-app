import { AVAILABLE_LANGUAGES } from "./languages.js?v=0.9.94.1";
import { speak, setTTS, speakSentenceOnLoad } from "./audioengine.js";
 let USER = null;
document.addEventListener("DOMContentLoaded", () => {
  const APP_VERSION = "v0.9.94.1";
  const MAX_LEVEL = 7;
  const DEV_START_AT_LEVEL_7 = false; // set false after stress testing
  const CONTENT_VERSION = 9;

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
  const quitBtn = document.getElementById("quit-learning");
  const hubQuitBtn = document.getElementById("hub-quit");
  const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const languageScreen = document.getElementById("language-screen");
  const ttsToggle = document.getElementById("tts-toggle");
  const languageButtonsContainer = document.getElementById("language-buttons");
  const languageState = {
  target: null,
  support: "en" // default for now
  };
  function createEmptyUser() {
  return {
    id: crypto.randomUUID(),
    supportLanguage: "en",
    lastActiveLanguage: null,
    runs: {} // languageCode -> run object
  };
}

function loadUser() {
  const raw = localStorage.getItem("zth_user");
  if (!raw) {
    USER = createEmptyUser();
    saveUser();
  } else {
    USER = JSON.parse(raw);
  }
}

function saveUser() {
  localStorage.setItem("zth_user", JSON.stringify(USER));
}

loadUser();
  const VOCAB_FILES = [
    "adjectives.json","connectors.json","directions_positions.json",
    "glue_words.json","nouns.json","numbers.json",
    "politeness_modality.json","pronouns.json","quantifiers.json",
    "question_words.json","time_words.json","verbs.json", "pokemon.json", "harry_potter.json", "cooking.json"
  ];
const CORE_BUNDLES = [

  { id: "core_01", concepts: ["FIRST_PERSON_SINGULAR","EAT","FOOD","SECOND_PERSON","DRINK"] },

  { id: "core_02", concepts: ["WATER","HE","READ","BOOK","SHE"] },

  { id: "core_03", concepts: ["SEE","PHONE","FIRST_PERSON_PLURAL","HAVE","JOB"] },

  { id: "core_04", concepts: ["THIRD_PERSON_PLURAL","SLEEP","BE","DO","NEW"] },

  { id: "core_05", concepts: ["OLD","BLACK","WHITE","GOOD","BAD"] },

  { id: "core_06", concepts: ["FAST","SLOW","SMALL","ONE","TWO"] },

  { id: "core_07", concepts: ["THREE","FOUR","FIVE","SIX","SEVEN"] },

  { id: "core_08", concepts: ["EIGHT","NINE","TEN","MY","HER"] },

  { id: "core_09", concepts: ["HIS","OUR","THEIR","YOUR","GIRL"] },

  { id: "core_10", concepts: ["BOY","WOMAN","MAN","BIG","ELEVEN"] },

  { id: "core_11", concepts: ["TWELVE","THIRTEEN","FOURTEEN","FIFTEEN","SIXTEEN"] },

  { id: "core_12", concepts: ["SEVENTEEN","EIGHTEEN","NINETEEN","TWENTY","HOUSE"] },

  { id: "core_13", concepts: ["HOME","SHIRT","SHOES","PANTS","CLOTHES"] },

  { id: "core_14", concepts: ["HAND","FACE","EYE","BREAKFAST","LUNCH"] },

  { id: "core_15", concepts: ["DINNER","GO","COME","USE","GET"] },

  { id: "core_16", concepts: ["START","STOP","THIS","THAT","AND"] },

  { id: "core_17", concepts: ["HAND","HEAD","ARM","LEG","FOOT"] },

  { id: "core_18", concepts: ["FINGER","MOUTH","FACE","EYE","MOM"] },

  { id: "core_19", concepts: ["DAD","BROTHER","SISTER","SON","DAUGHTER"] },

  { id: "core_20", concepts: ["BREAKFAST","LUNCH","DINNER","JOB","BOOK"] },

  { id: "core_21", concepts: ["ROOM"] }

];
const RESOURCE_PACKS = {
  pokemon: {
  vocabFile: "pokemon.json",
  templateFile: "sentence_templates_pokemon.json",
  bundles: [

    { id: "pokemon_01", concepts: ["POKEMON","TRAINER","GYM","LEAGUE","GYM_LEADER"] },

    { id: "pokemon_02", concepts: ["ELITE_FOUR","POKEMON_CENTER","FOREST","CAVE","TOWN"] },

    { id: "pokemon_03", concepts: ["BATTLE","MOVE","DAMAGE","DEFENSE","SPEED"] },

    { id: "pokemon_04", concepts: ["STAT","ABILITY","TYPE","LEVEL","EXPERIENCE"] },

    { id: "pokemon_05", concepts: ["ITEM","POTION","REVIVE","HEALTH","BADGE"] },

    { id: "pokemon_06", concepts: ["TECHNICAL_MACHINE","BURN","POISON","SLEEP_STATUS","PARALYZE"] },

    { id: "pokemon_07", concepts: ["SEEN","CAPTURED","ATTACK","RUN","CATCH"] },

    { id: "pokemon_08", concepts: ["DEFEAT","SWITCH","USE","FLY","PLAY"] },

    { id: "pokemon_09", concepts: ["HEAL","RESTORE","GAIN_EXPERIENCE","EVOLVE","WILD"] },

    { id: "pokemon_10", concepts: ["STRONG","EFFECTIVE","SUPER_EFFECTIVE","VERY_EFFECTIVE","LEGENDARY"] }

  ]
},
  harry_potter: {
  vocabFile: "harry_potter.json",
  templateFile: "sentence_templates_harry_potter.json",
  bundles: [

    { id: "hp_01", concepts: ["WAND","MAGIC","WIZARD","WITCH","SPELL"] },

    { id: "hp_02", concepts: ["POTION","SCHOOL","CAULDRON","BROOM","OWL"] },

    { id: "hp_03", concepts: ["CASTLE","PROFESSOR","STUDENT","ELF","UNICORN"] },

    { id: "hp_04", concepts: ["GIANT","TROLL","GHOST","FOREST","SPIDER"] },

    { id: "hp_05", concepts: ["LIBRARY","CLASS","LESSON","HOMEWORK","EXAM"] },

    { id: "hp_06", concepts: ["QUESTION","ANSWER","IDEA","CHANCE","MYSTERY"] },

    { id: "hp_07", concepts: ["SECRET","FRIEND","ENEMY","CLOAK","DOOR"] },

    { id: "hp_08", concepts: ["CAST","PROTECT","CHARM","CURSE","LEARN"] },

    { id: "hp_09", concepts: ["WRITE","STUDY","VANISH","TRANSFORM","FLY"] },

    { id: "hp_10", concepts: ["SHOUT","MAGICAL","BRAVE"] }

  ]
},
  cooking: {
  vocabFile: "cooking.json",
  templateFile: "sentence_templates_cooking.json",
  bundles: [

    { id: "cook_01", concepts: ["COOK","CUT","BOIL","PEEL","FRY"] },

    { id: "cook_02", concepts: ["STIR","MIX","WASH","HEAT","PAN"] },

    { id: "cook_03", concepts: ["KNIFE","FORK","SPOON","SPATULA","POT"] },

    { id: "cook_04", concepts: ["GLASS","LITRE","DECILITRE","MILLILITRE","GRAM"] },

    { id: "cook_05", concepts: ["KILOGRAM","MEAT","CHICKEN","FISH","VEGETABLE"] },

    { id: "cook_06", concepts: ["POTATO","SALAD","FRUIT","BANANA","SOUP"] },

    { id: "cook_07", concepts: ["DOUGH","SAUCE","INGREDIENT","KITCHEN","OVEN"] },

    { id: "cook_08", concepts: ["STOVE","SINK","FREEZER","SALT","PEPPER"] },

    { id: "cook_09", concepts: ["BUTTER","SPICE","RECIPE","SWEET","SALTY"] },

    { id: "cook_10", concepts: ["SOUR","FRESH","FROZEN","RAW"] }

  ]
}
};

function createRunState() {
  return {
    selectedResourcePacks: [],
    setupComplete: false,
    releasePlan: [],
    releasePlanIndex: 0,
    releasedBundleIds: [],

    released: [],
    progress: {},
    templateProgress: {},
    exerciseCounter: 0,
    recentTemplates: [],

    sessionNumber: 1,
    sessionLevelUps: {},
    sessionAttempts: {},
    sessionComplete: false,

    contentVersion: CONTENT_VERSION
  };
}
function buildReleasePlan(selectedPacks) {

  const plan = [];

  const coreQueue = [...CORE_BUNDLES];

  // 🚫 TEMP: ignore resource packs completely
  while (coreQueue.length) {

    for (let i = 0; i < 4 && coreQueue.length; i++) {
      plan.push(coreQueue.shift().id);
    }

  }

  return plan;
}
function renderPackSelection() {

  const container = document.getElementById("pack-buttons");
  container.innerHTML = "";

  Object.keys(RESOURCE_PACKS).forEach(packId => {

    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = packId.replace("_", " ").toUpperCase();

    btn.dataset.pack = packId;

    btn.onclick = () => {

      const selected = new Set(run.selectedResourcePacks);

      if (selected.has(packId)) {
        selected.delete(packId);
        btn.classList.remove("selected");
      } else {
        if (selected.size >= 2) return; // limit to 2
        selected.add(packId);
        btn.classList.add("selected");
      }

      run.selectedResourcePacks = Array.from(selected);

    };

    container.appendChild(btn);

  });

}
function buildBundleIndex() {

  const allBundles = [
    ...CORE_BUNDLES,
    ...Object.values(RESOURCE_PACKS).flatMap(pack => pack.bundles)
  ];

  return Object.fromEntries(
    allBundles.map(bundle => [bundle.id, bundle])
  );
}

let BUNDLE_INDEX = {};
function releaseNextBundle(run) {

  if (!run.releasePlan || run.releasePlanIndex >= run.releasePlan.length) {
    return;
  }

  const bundleId = run.releasePlan[run.releasePlanIndex];
  const bundle = BUNDLE_INDEX[bundleId];

  if (!bundle) return;

  bundle.concepts.forEach(cid => {

    if (!run.released.includes(cid)) {
      run.released.push(cid);
      ensureProgress(cid);
    }

  });

  run.releasedBundleIds.push(bundleId);
  run.releasePlanIndex++;

}
// --------------------
// Support Language UI (Abbreviation + Native Name)
// --------------------

let ttsEnabled = false;

if (ttsToggle) {
  ttsToggle.onclick = () => {

    ttsEnabled = !ttsEnabled;

    setTTS(ttsEnabled);

    ttsToggle.textContent = ttsEnabled ? "🔊 TTS ON" : "🔊 TTS OFF";
  };
}
const SUPPORT_LANGUAGES = {
  en: { short: "EN", label: "English" },
  pt: { short: "PT", label: "Português" },
  ja: { short: "JA", label: "日本語" },
  no: { short: "NO", label: "Norsk" },
  ar: { short: "AR", label: "العربية" },
  ko: { short: "KO", label: "한국어" }
};
const UI_STRINGS = {

  en: {
    openApp: "OPEN APP",
    languagesTitle: "LANGUAGES",
    chooseLanguage: "Choose a language to study",
    quitLearning: "QUIT LEARNING",
    sessionTitle: "TODAY'S SESSION",
    startSubtitle: "Language learning",

    chooseTranslation: "Choose the correct translation for:",
    originalSentence: "Original sentence:",
    fillMissing: "Fill in the missing word:",
    inThisSentence: "In this sentence:",
    check: "Check",
    continue: "Continue",
    correct: "Correct.",
    incorrect: "Incorrect.",
    level: "Level"
  },

  pt: {
    openApp: "ABRIR APP",
    languagesTitle: "IDIOMAS",
    chooseLanguage: "Escolha um idioma para estudar",
    quitLearning: "SAIR",
    sessionTitle: "SESSÃO DE HOJE",
    startSubtitle: "Aprendizado de idiomas",

    chooseTranslation: "Escolha a tradução correta para:",
    originalSentence: "Frase original:",
    fillMissing: "Preencha a palavra que falta:",
    inThisSentence: "Nesta frase:",
    check: "Verificar",
    continue: "Continuar",
    correct: "Correto.",
    incorrect: "Incorreto.",
    level: "Nível"
  },

  ja: {
    openApp: "アプリを開く",
    languagesTitle: "言語",
    chooseLanguage: "学習する言語を選んでください",
    quitLearning: "終了",
    sessionTitle: "今日のセッション",
    startSubtitle: "言語学習",

    chooseTranslation: "正しい翻訳を選んでください:",
    originalSentence: "元の文:",
    fillMissing: "空欄を埋めてください:",
    inThisSentence: "この文では:",
    check: "確認",
    continue: "続ける",
    correct: "正解。",
    incorrect: "不正解。",
    level: "レベル"
  },

  no: {
    openApp: "ÅPNE APP",
    languagesTitle: "SPRÅK",
    chooseLanguage: "Velg et språk å studere",
    quitLearning: "AVSLUTT",
    sessionTitle: "DAGENS ØKT",
    startSubtitle: "Språklæring",

    chooseTranslation: "Velg riktig oversettelse for:",
    originalSentence: "Original setning:",
    fillMissing: "Fyll inn det manglende ordet:",
    inThisSentence: "I denne setningen:",
    check: "Sjekk",
    continue: "Fortsett",
    correct: "Riktig.",
    incorrect: "Feil.",
    level: "Nivå"
  },

  ar: {
    openApp: "افتح التطبيق",
    languagesTitle: "اللغات",
    chooseLanguage: "اختر لغة للدراسة",
    quitLearning: "إنهاء",
    sessionTitle: "جلسة اليوم",
    startSubtitle: "تعلم اللغات",

    chooseTranslation: "اختر الترجمة الصحيحة لـ:",
    originalSentence: "الجملة الأصلية:",
    fillMissing: "املأ الكلمة الناقصة:",
    inThisSentence: "في هذه الجملة:",
    check: "تحقق",
    continue: "متابعة",
    correct: "صحيح.",
    incorrect: "خطأ.",
    level: "المستوى"
  },
  ko: {
  openApp: "앱 열기",
  languagesTitle: "언어",
  chooseLanguage: "공부할 언어를 선택하세요",
  quitLearning: "종료",
  sessionTitle: "오늘의 세션",
  startSubtitle: "언어 학습",

  chooseTranslation: "올바른 번역을 선택하세요:",
  originalSentence: "원문:",
  fillMissing: "빈칸을 채우세요:",
  inThisSentence: "이 문장에서:",
  check: "확인",
  continue: "계속",
  correct: "정답입니다.",
  incorrect: "틀렸습니다.",
  level: "레벨"
}

};
const HUB_LANGUAGE_NAMES = {
  en: {
    en: "English",
    pt: "Portuguese",
    ja: "Japanese",
    no: "Norwegian",
    ar: "Arabic",
    ko: "Korean"
  },

  pt: {
    en: "Inglês",
    pt: "Português",
    ja: "Japonês",
    no: "Norueguês",
    ar: "Árabe",
    ko: "Coreano"
  },

  ja: {
    en: "英語",
    pt: "ポルトガル語",
    ja: "日本語",
    no: "ノルウェー語",
    ar: "アラビア語",
    ko: "韓国語"
  },

  no: {
    en: "Engelsk",
    pt: "Portugisisk",
    ja: "Japansk",
    no: "Norsk",
    ar: "Arabisk",
    ko: "Koreansk"
  },

  ar: {
    en: "الإنجليزية",
    pt: "البرتغالية",
    ja: "اليابانية",
    no: "النرويجية",
    ar: "العربية",
    ko: "الكورية"
  },

  ko: {
    en: "영어",
    pt: "포르투갈어",
    ja: "일본어",
    no: "노르웨이어",
    ar: "아랍어",
    ko: "한국어"
  }
};
const supportPill = document.getElementById("support-pill");
const supportShort = document.getElementById("support-short");
const supportLabel = document.getElementById("support-label");
const supportDropdown = document.getElementById("support-dropdown");

// Initialize from USER state
languageState.support = USER.supportLanguage || "en";
updateSupportUI(languageState.support);
updateUIStrings(languageState.support);
renderLanguageButtons();
// Build dropdown
supportDropdown.innerHTML = "";

Object.entries(SUPPORT_LANGUAGES).forEach(([code, data]) => {

  const option = document.createElement("div");
  option.className = "support-option";

  option.innerHTML = `
    <span class="support-short">${data.short}</span>
    <span>${data.label}</span>
  `;

  option.onclick = () => {
  languageState.support = code;
  USER.supportLanguage = code;
  saveUser();
  updateSupportUI(code);
  updateUIStrings(code);
  renderLanguageButtons();
  supportDropdown.classList.add("hidden");
};

  supportDropdown.appendChild(option);
});

// Toggle dropdown
supportPill.addEventListener("click", () => {
  supportDropdown.classList.toggle("hidden");
});

function updateSupportUI(code) {
  const data = SUPPORT_LANGUAGES[code];
  supportShort.textContent = data.short;
  supportLabel.textContent = data.label;
}
  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };
  function renderLanguageButtons() {

  languageButtonsContainer.innerHTML = "";

  const support = languageState.support || "en";
  const names = HUB_LANGUAGE_NAMES[support] || HUB_LANGUAGE_NAMES.en;

  AVAILABLE_LANGUAGES.forEach(lang => {

    const btn = document.createElement("button");
    btn.className = "primary";

    btn.textContent = names[lang.code] || lang.label;

    btn.onclick = () => enterLanguage(lang.code);

    languageButtonsContainer.appendChild(btn);
  });
}
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

  const TEMPLATE_FILES = [
  "sentence_templates.json"
];

async function loadTemplates() {

  if (TEMPLATE_CACHE) return TEMPLATE_CACHE;

  TEMPLATE_CACHE = [];

  for (const file of TEMPLATE_FILES) {

    const res = await fetch(file, { cache: "no-store" });
    const data = await res.json();

    TEMPLATE_CACHE.push(...(data.templates || []));

  }

  return TEMPLATE_CACHE;
}

  let run = null;
function updateUIStrings(lang) {

  const strings = UI_STRINGS[lang] || UI_STRINGS.en;

  document.getElementById("open-app").textContent = strings.openApp;

  const languageTitle = document.querySelector("#language-screen .title");
  const languageSubtitle = document.querySelector("#language-screen .subtitle");

  languageTitle.textContent = strings.languagesTitle;
  languageSubtitle.textContent = strings.chooseLanguage;

  document.getElementById("hub-quit").textContent = strings.quitLearning;
  document.getElementById("quit-learning").textContent = strings.quitLearning;

  const sessionTitle = document.querySelector("#learning-screen .title");
  sessionTitle.textContent = strings.sessionTitle;
  if (lang === "ar") {
  document.documentElement.dir = "rtl";
} else {
  document.documentElement.dir = "ltr";
}
const startSubtitle = document.getElementById("start-subtitle");
if (startSubtitle) {
  startSubtitle.textContent =
    (lang === "ar")
      ? `تعلم اللغات ${APP_VERSION}`
      : strings.startSubtitle + " " + APP_VERSION;
}
}
function ui(key) {
  const lang = languageState.support || "en";
  const strings = UI_STRINGS[lang] || UI_STRINGS.en;
  return strings[key] || UI_STRINGS.en[key] || key;
}
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
function ensureTemplateProgress(tpl) {
  const id = tpl.template_id;

  if (!run.templateProgress[id]) {
    run.templateProgress[id] = {
  streak: 0,
  reinforcementStage: 0,
  completed: false,
  lastShownAt: -Infinity,
  lastResult: null
};
  }

  return run.templateProgress[id];
}
function passesSpacingRule(cid) {

  const state = ensureProgress(cid);
  const level = state.level;
  const currentIndex = run.exerciseCounter;

  if (state.lastShownAt === -Infinity) return true;

  const distance = currentIndex - state.lastShownAt;

  // LEVEL 1 → always treated as correct
  if (level === 1) {
  return distance >= 1;
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

  run = createRunState();

  run.selectedResourcePacks = [];

  run.releasePlan = buildReleasePlan(run.selectedResourcePacks);

  run.releasePlanIndex = 0;

  // Seed first bundles manually
for (let i = 0; i < 2; i++) {
  releaseNextBundle(run);
}

}
function migrateRunState() {

  if (!run.releasePlan) {
    run.releasePlan = buildReleasePlan(run.selectedResourcePacks || []);
  }

  if (run.releasePlanIndex === undefined) {
    run.releasePlanIndex = 0;
  }

  USER.runs[languageState.target] = run;
  saveUser();
}

  function applyResult(cid, correct) {
  const state = ensureProgress(cid);

  // Spacing tracking
  state.lastShownAt = run.exerciseCounter;
  state.lastResult = correct;

  if (!run.sessionAttempts) run.sessionAttempts = {};
  if (!run.sessionLevelUps) run.sessionLevelUps = {};
  if (run.sessionComplete === undefined) run.sessionComplete = false;

  run.sessionAttempts[cid] = (run.sessionAttempts[cid] || 0) + 1;

  if (!correct) {
    state.streak = 0;
    state.cooldown = 2;
  } else {
    state.streak++;
    state.cooldown = 4;

    let leveledUp = false;

    const needed = state.level === 1 ? 1 : 2;

if (state.streak >= needed) {
      const levelCap = isModifierConcept(cid) ? 5 : MAX_LEVEL;

if (state.level < levelCap) {
  state.level++;
  leveledUp = true;
} else {
  state.completed = true;
}
      state.streak = 0;
    }

    if (leveledUp) {
      run.sessionLevelUps[cid] = (run.sessionLevelUps[cid] || 0) + 1;
    }
  }

  // 🔥 RULE B with NEW thresholds
  const activeConcepts = run.released.filter(c => {

  const s = ensureProgress(c);
  if (s.completed) return false;

  // concept must be schedulable
  const meta = window.GLOBAL_VOCAB.concepts[c];

  if (meta?.type === "adjective" || meta?.type === "number") {
    return true;
  }

  const hasTemplate = TEMPLATE_CACHE.some(tpl =>
  tpl.concepts.includes(cid) &&
  tpl.concepts.every(c => run.released.includes(c))
);

  return hasTemplate;
});

  const allFatigued =
    activeConcepts.length > 0 &&
    activeConcepts.every(c => {
      const attempts = run.sessionAttempts[c] || 0;
      const levelUps = run.sessionLevelUps[c] || 0;
      return attempts >= 8 || levelUps >= 3;
    });

  if (allFatigued) {
    run.sessionComplete = true;
  }

  USER.runs[languageState.target] = run;
  saveUser();
}


  function templateEligible(tpl) {

  const id = tpl.template_id;

  const tState = ensureTemplateProgress(tpl);

  // If template is completed, do not schedule again
  if (tState.completed) return false;

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
    const filtered = eligible.filter(tpl =>
  !run.recentTemplates.includes(tpl.template_id)
);

const pool = filtered.length ? filtered : eligible;

const tpl = pool[Math.floor(Math.random() * pool.length)];

run.recentTemplates.push(tpl.template_id);

if (run.recentTemplates.length > 3) {
  run.recentTemplates.shift();
}

return tpl;
  }

 function formOf(lang, cid) {
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];

  if (!entry) return cid;

  // nouns
  if (typeof entry === "object" && entry.form) {
    return entry.form;
  }

  // pronouns
  if (Array.isArray(entry)) {
    return entry[0];
  }

  // verbs (base/infinitive)
  if (typeof entry === "object" && entry.base) {
    return entry.base;
  }

  // fallback: pick first string value in object
  if (typeof entry === "object") {
    const first = Object.values(entry).find(v => typeof v === "string");
    if (first) return first;
  }

  if (typeof entry === "string") return entry;

  return cid;
}
function nounPhrase(lang, cid) {

  const meta = window.GLOBAL_VOCAB.concepts[cid];
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid] || {};

  const base = entry.form || formOf(lang, cid);

  if (!meta?.countable) return base;

  if (lang === "en") {
    const article = entry.article || "a";
    return article + " " + base;
  }

  if (lang === "pt") {
    const article = entry.gender === "f" ? "uma" : "um";
    return article + " " + base;
  }

  if (lang === "no") {
    if (entry.gender === "n") return "et " + base;
    if (entry.gender === "f") return "ei " + base;
    return "en " + base;
  }

  return base;
}
  function getVerbForm(verbCid, subjectCid, lang) {
  const verbData = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[verbCid];
  if (!verbData) return verbCid;

  const subject = window.GLOBAL_VOCAB.concepts[subjectCid];
  if (!subject) return verbData.base || verbCid;

  // Build dynamic key (e.g. "1_singular", "2_plural", etc.)
  let key = "base";

  if (subject.person && subject.number) {
    key = `${subject.person}_${subject.number}`;
  }
// Portuguese: "você/vocês" conjugate like 3rd person
if (lang === "pt") {
  if (subjectCid === "SECOND_PERSON") key = "3_singular";
  if (subjectCid === "SECOND_PERSON_PLURAL") key = "3_plural";
}
  // 1️⃣ Exact match (preferred)
  if (verbData[key]) {
    return verbData[key];
  }

  // 2️⃣ If language defines a uniform present form (e.g. Norwegian)
  if (verbData.present) {
    return verbData.present;
  }

  // 3️⃣ If only base + 3_singular exist, use 3_singular
  const keys = Object.keys(verbData);
  const onlyBaseAndThird =
    keys.length === 2 &&
    keys.includes("base") &&
    keys.includes("3_singular");

  if (onlyBaseAndThird) {
  // English-style verbs (base + 3_singular)
  if (subject.person === 3 && subject.number === "singular") {
    return verbData["3_singular"];
  }
  return verbData.base;
}

  // 4️⃣ Final fallback
  return verbData.base || verbCid;
}

  function shuffle(arr) {
    return arr.sort(() => Math.random() - 0.5);
  }
  function safe(v) {
  return v ?? "";
}
function resolvePrompt(q, supportLang) {
  if (!q) return "";

  // Most flexible:
  // - if prompt is a string, use it
  // - if prompt is an object, use q.prompt[supportLang]
  // - otherwise fall back to English or the first available language
  const p = q.prompt;

  if (typeof p === "string") return p;

  if (p && typeof p === "object") {
    if (typeof p[supportLang] === "string") return p[supportLang];
    if (typeof p.en === "string") return p.en;

    const first = Object.values(p).find(v => typeof v === "string");
    if (first) return first;
  }

  return "";
}
function orderedConceptsForTemplate(tpl, lang) {
  // 1) Use explicit order if present
  const explicit = tpl.order?.[lang] || tpl.order?.default;
  if (Array.isArray(explicit) && explicit.length) return explicit;

  // 2) Fallback: derive order based on basic word order
  //    This keeps things working even before you finish adding tpl.order everywhere.
  const concepts = tpl.concepts || [];

  const pronoun = concepts.find(c => window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun");
  const verb = concepts.find(c => window.GLOBAL_VOCAB.concepts[c]?.type === "verb");
  const object = concepts.find(c => {
    const t = window.GLOBAL_VOCAB.concepts[c]?.type;
    return t && t !== "pronoun" && t !== "verb";
  });

  const WORD_ORDER = {
  ja: "SOV",
  ar: "VSO",
  en: "SVO",
  pt: "SVO",
  no: "SVO",
  ko: "SOV"
};

const orderType = WORD_ORDER[lang] || "SVO";

let ordered;

if (orderType === "SOV") {
  ordered = [pronoun, object, verb];
} else if (orderType === "VSO") {
  ordered = [verb, pronoun, object];
} else {
  ordered = [pronoun, verb, object];
}

  // Add any remaining concepts (so we don't silently drop extras later)
  const used = new Set(ordered.filter(Boolean));
  concepts.forEach(c => { if (!used.has(c)) ordered.push(c); });

  return ordered.filter(Boolean);
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
  function isModifierConcept(cid) {
  const t = window.GLOBAL_VOCAB.concepts[cid]?.type;
  return t === "adjective" || t === "number";
}

function buildSameTypeOptions(targetConcept, desiredTotal = 4) {
  const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
  if (!meta) return null;

  const pool = run.released.filter(cid => {
    if (cid === targetConcept) return false;
    const st = ensureProgress(cid);
    if (st.completed) return false;
    return window.GLOBAL_VOCAB.concepts[cid]?.type === meta.type;
  });

  if (pool.length < desiredTotal - 1) return null;

  return shuffle([targetConcept, ...shuffle(pool).slice(0, desiredTotal - 1)]);
}
function buildSentence(lang, tpl, forcedConcept = null) {

  const ordered = orderedConceptsForTemplate(tpl, lang);
  if (!ordered || !ordered.length) return "";

  const forcedMeta = forcedConcept
    ? window.GLOBAL_VOCAB.concepts[forcedConcept]
    : null;

  const subjectCid = ordered.find(c =>
    window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
  );

  const words = ordered.map(cid => {
    const meta = window.GLOBAL_VOCAB.concepts[cid];
    if (!meta) return cid;

    if (meta.type === "verb") {
      return getVerbForm(cid, subjectCid, lang);
    }

    if (meta.type === "noun") {
      const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid] || {};
      const baseSurface = formOf(lang, cid);
      const pluralSurface = entry.plural || baseSurface;

      let nounSurface = baseSurface;
      let adjectiveWord = null;
      let numberWord = null;

      // forced adjective OR eligible learned adjective
      if (forcedMeta?.type === "adjective") {
        adjectiveWord = formOf(lang, forcedConcept);
      } else {
        const adjectives = run.released.filter(c => {
          const m = window.GLOBAL_VOCAB.concepts[c];
          if (m?.type !== "adjective") return false;
          const st = ensureProgress(c);
          return !st.completed && st.level >= 4;
        });

        if (adjectives.length && Math.random() < 0.6) {
          const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
          adjectiveWord = formOf(lang, adj);
        }
      }

      // forced number OR learned number
      if (meta.countable) {
        if (forcedMeta?.type === "number") {
          numberWord = formOf(lang, forcedConcept);
          nounSurface = pluralSurface;
        } else {
          const numbers = run.released.filter(c => {
            const m = window.GLOBAL_VOCAB.concepts[c];
            if (m?.type !== "number") return false;
            const st = ensureProgress(c);
            return !st.completed && st.level >= 4;
          });

          if (numbers.length) {
            const n = numbers[Math.floor(Math.random() * numbers.length)];
            numberWord = formOf(lang, n);
            nounSurface = pluralSurface;
          }
        }
      }

      let phrase = nounSurface;

      if (adjectiveWord) {
        phrase = adjectiveWord + " " + phrase;
      }

      if (numberWord) {
        return numberWord + " " + phrase;
      }

      if (meta.countable) {
        if (lang === "en") {
          const article = entry.article || "a";
          return article + " " + phrase;
        }

        if (lang === "pt") {
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid] || {};
  const gender = entry?.gender;

  if (numberWord) {
    return numberWord + " " + phrase;
  }

  return (gender === "f" ? "uma " : "um ") + phrase;
}

        if (lang === "no") {
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid] || {};
  const gender = entry?.gender;

  if (numberWord) {
    return numberWord + " " + phrase;
  }

  if (gender === "n") return "et " + phrase;
  if (gender === "f") return "ei " + phrase;
  return "en " + phrase;
}
      }

      return phrase;
    }

    return formOf(lang, cid);
  });

  if (lang === "ja") {
    const wordsWithParticles = [...words];

    const pronounIndex = ordered.findIndex(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    const nounIndex = ordered.findIndex(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "noun"
    );

    if (pronounIndex !== -1) wordsWithParticles.splice(pronounIndex + 1, 0, "は");
    if (nounIndex !== -1) wordsWithParticles.splice(nounIndex + 1, 0, "を");

    return wordsWithParticles.join("");
  }

  let sentence = words.join(" ");
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return sentence + ".";
}



  function renderExposure(targetLang, supportLang, tpl, targetConcept) {
  subtitle.textContent = ui("level") + " " + levelOf(targetConcept);

  const targetSentence = buildSentence(targetLang, tpl, targetConcept);
  const supportSentence = buildSentence(supportLang, tpl, targetConcept);

  content.innerHTML = `
    <h2>${safe(formOf(targetLang, targetConcept))}</h2>
    <p>${safe(formOf(supportLang, targetConcept))}</p>
    <hr>
    <p class="tts-target">${safe(targetSentence)}</p>
    <p>${safe(supportSentence)}</p>
    <button id="continue-btn">${ui("continue")}</button>
  `;

  speakSentenceOnLoad(targetSentence, targetLang);

  document.getElementById("continue-btn").onclick = () => {
    decrementCooldowns();
    applyResult(targetConcept, true);
    setTimeout(() => renderNext(targetLang, supportLang), 0);
  };
}

  function renderComprehension(targetLang, supportLang, tpl, targetConcept) {
  subtitle.textContent = ui("level") + " " + levelOf(targetConcept);

  let selectedOption = null;
  const meta = window.GLOBAL_VOCAB.concepts[targetConcept];

  // --- Modifier path ---
  if (isModifierConcept(targetConcept)) {
    const options = buildSameTypeOptions(targetConcept, 4);
    if (!options) return null;

    const sentence = buildSentence(targetLang, tpl, targetConcept);

    content.innerHTML = `
      <p class="tts-target">${safe(sentence)}</p>
      <p><strong>${ui("chooseTranslation")}</strong></p>
      <h2>${safe(formOf(targetLang, targetConcept))}</h2>
      <div id="choices"></div>
      <div style="margin-top:20px;text-align:center;">
        <button id="check-btn" disabled>${ui("check")}</button>
      </div>
    `;

    speakSentenceOnLoad(sentence, targetLang);

    const container = document.getElementById("choices");
    const checkBtn = document.getElementById("check-btn");

    options.forEach(opt => {
      const btn = document.createElement("button");
      const meta = window.GLOBAL_VOCAB.concepts[opt];
btn.textContent = meta?.type === "noun"
  ? nounPhrase(supportLang, opt)
  : formOf(supportLang, opt);

      btn.onclick = () => {
        container.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
        selectedOption = opt;
        btn.classList.add("selected");
        checkBtn.disabled = false;
      };

      container.appendChild(btn);
    });

    checkBtn.onclick = () => {
      if (!selectedOption) return;

      const correct = selectedOption === targetConcept;

      container.querySelectorAll("button").forEach(btn => {
        const value = options.find(o => formOf(supportLang, o) === btn.textContent);
        if (value === targetConcept) btn.classList.add("correct");
        if (value === selectedOption && !correct) btn.classList.add("incorrect");
      });

      decrementCooldowns();
      applyResult(targetConcept, correct);

      checkBtn.textContent = ui("continue");
      checkBtn.onclick = () => renderNext(targetLang, supportLang);
    };

    return;
  }

  // --- Existing core path ---
  const role =
    meta?.type === "pronoun" ? "pronoun" :
    meta?.type === "verb" ? "verb" :
    "object";

  const q = tpl.questions?.[role];
  if (!q) {
  return null;
}

  const releasedOptions = q.choices.filter(opt => {
  return run.released.includes(opt);
});

if (releasedOptions.length !== 4) return null;

const options = shuffle([...releasedOptions]);
  const promptText = resolvePrompt(q, supportLang);
  const sentence = buildSentence(targetLang, tpl);

  content.innerHTML = `
    <p class="tts-target">${safe(sentence)}</p>
    <p><strong>${safe(promptText)}</strong></p>
    <div id="choices"></div>
    <div style="margin-top:20px;text-align:center;">
      <button id="check-btn" disabled>${ui("check")}</button>
    </div>
  `;

  speakSentenceOnLoad(sentence, targetLang);

  const container = document.getElementById("choices");
  const checkBtn = document.getElementById("check-btn");

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = formOf(supportLang, opt);

    btn.onclick = () => {
      container.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      selectedOption = opt;
      btn.classList.add("selected");
      checkBtn.disabled = false;
    };

    container.appendChild(btn);
  });

  checkBtn.onclick = () => {
    if (!selectedOption) return;

    const correct = selectedOption === q.answer;

    container.querySelectorAll("button").forEach(btn => {
      const value = options.find(o => formOf(supportLang, o) === btn.textContent);
      if (value === q.answer) btn.classList.add("correct");
      if (value === selectedOption && !correct) btn.classList.add("incorrect");
    });

    decrementCooldowns();
    applyResult(targetConcept, correct);

    checkBtn.textContent = ui("continue");
    checkBtn.onclick = () => renderNext(targetLang, supportLang);
  };
  return true;
}
  // -------------------------
  // Level 3 – Recognition (with support sentence shown)
  // -------------------------
function buildRecognitionOptions(tpl, targetConcept, desiredTotalOptions) {

  const currentLevel = levelOf(targetConcept);
  const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
  if (!meta) return null;

  // Strict pool
  const strictPool = run.released.filter(cid => {
    if (cid === targetConcept) return false;

    const st = ensureProgress(cid);
    
    if (st.completed) return false;
    if (st.level < currentLevel) return false;
    

    const m = window.GLOBAL_VOCAB.concepts[cid];
    return m && m.type === meta.type;
  });

  // Relaxed pool
  const relaxedPool = run.released.filter(cid => {
    if (cid === targetConcept) return false;

    const m = window.GLOBAL_VOCAB.concepts[cid];
    return m && m.type === meta.type;
  });

  const pool = strictPool.length >= 3 ? strictPool : relaxedPool;

  if (pool.length < 3) {
  const fallback = run.released.filter(cid => cid !== targetConcept);
  if (fallback.length < 3) return null;
  return shuffle([targetConcept, ...shuffle(fallback).slice(0,3)]);
}

  const targetTotal = Math.max(4, Math.min(desiredTotalOptions, pool.length + 1));
  const distractorCount = targetTotal - 1;

  return shuffle([targetConcept, ...shuffle(pool).slice(0, distractorCount)]);
}

  function renderRecognitionL3(targetLang, supportLang, tpl, targetConcept) {
  subtitle.textContent = "Level " + levelOf(targetConcept);

  // --- Modifier path ---
if (isModifierConcept(targetConcept)) {

  const sentenceTarget = buildSentence(targetLang, tpl, targetConcept);
  const sentenceSupport = buildSentence(supportLang, tpl, targetConcept);

  const targetSurface = formOf(targetLang, targetConcept);
  const blanked = blankSentence(sentenceTarget, targetSurface);

  const options = buildSameTypeOptions(targetConcept, 4);

  if (!options) {
    return null;
  }

  content.innerHTML = `
    <p><strong>${ui("originalSentence")}</strong></p>
    <p>${safe(sentenceSupport)}</p>
    <hr>
    <p><strong>${ui("fillMissing")}</strong></p>
    <p>${safe(blanked)}</p>
    <div id="choices"></div>
  `;

  const container = document.getElementById("choices");

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = formOf(targetLang, opt);

    btn.onclick = () => {
      const correct = opt === targetConcept;
      btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
      decrementCooldowns();
      applyResult(targetConcept, correct);
      setTimeout(() => renderNext(targetLang, supportLang), 600);
    };

    container.appendChild(btn);
  });

  return true; // 🔥 CRITICAL
}

  // --- Existing core path ---
  const supportSentence = safe(buildSentence(supportLang, tpl));
  const ordered = orderedConceptsForTemplate(tpl, targetLang);

  const subjectCid = ordered.find(c =>
    window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
  );

  const words = ordered.map(cid => {
    const meta = window.GLOBAL_VOCAB.concepts[cid];
    if (!meta) return cid;
    if (meta.type === "verb") return getVerbForm(cid, subjectCid, targetLang);
    return formOf(targetLang, cid);
  });

  const blankIndex = ordered.indexOf(targetConcept);
  const blankedWords = words.map((w, i) => i === blankIndex ? "_____" : w);
  const blanked = blankedWords.join(" ");

  const options = buildRecognitionOptions(tpl, targetConcept, 4);
  if (!options || options.length === 0) {
  renderNext(targetLang, supportLang);
  return;
}

  content.innerHTML = `
    <p><strong>${ui("originalSentence")}</strong></p>
    <p>${supportSentence}</p>
    <hr>
    <p><strong>${ui("fillMissing")}</strong></p>
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
    }const meta = window.GLOBAL_VOCAB.concepts[opt];

text = meta?.type === "noun"
  ? nounPhrase(targetLang, opt)
  : (tpl.surface?.[targetLang]?.[opt] || formOf(targetLang, opt));

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

  // NOUNS → use noun phrase (adds articles)
  if (meta?.type === "noun") {
    return nounPhrase(targetLang, cid);
  }

  // VERBS → strictly base / infinitive only
  if (meta?.type === "verb") {
    if (typeof entry === "object") {
      if (typeof entry.base === "string") return entry.base;
      if (typeof entry.infinitive === "string") return entry.infinitive;
    }
    if (typeof entry === "string") return entry;
    return cid;
  }

  // OTHER TYPES
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

      if (pool.length < 3) return [];

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
if (!options || options.length === 0) {
  return null;
}
    content.innerHTML = `
      <p>${ui("chooseTranslation")}</p>
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
  // Not enough level-5 concepts — fall back to template-driven routing
  const tpl = chooseTemplate();
  if (!tpl) {
    content.innerHTML = "All concepts completed.";
    return;
  }

  const targetConcept = determineTargetConcept(tpl);
  const level = levelOf(targetConcept);


  if (level === 6) {run.recentTemplates.push(tpl);
if (run.recentTemplates.length > 3) {
  run.recentTemplates.shift();
}

    return renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept);
  }

  if (level === 4) {
    return renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);
  }

  return renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);
}

  // Shuffle and take max 5
  const shuffled = shuffle([...eligible]);
  const selected = shuffled.slice(0, Math.min(5, shuffled.length));

  // Build left (support) and right (target) columns
  const leftItems = shuffle([...selected]);
  const rightItems = shuffle([...selected]);

  const selectedPairs = new Map();

  content.innerHTML = `
  <div id="matching-wrapper" style="position:relative;">

    <svg id="wire-layer"
         style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></svg>

    <div id="matching-container" style="
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:80px;
      margin-top:20px;
      position:relative;
    ">
      <div id="left-column" style="display:flex;flex-direction:column;gap:20px;"></div>
      <div id="right-column" style="display:flex;flex-direction:column;gap:20px;"></div>
    </div>

    <div style="margin-top:30px;text-align:center;">
      <button id="check-matches">${ui("check")}</button>
    </div>

  </div>
`;

  const leftColumn = document.getElementById("left-column");
  const rightColumn = document.getElementById("right-column");

  let activeSelection = null;
const wireLayer = document.getElementById("wire-layer");
const connectionLines = new Map();

function drawConnection(leftBtn, rightBtn) {

  const leftRect = leftBtn.getBoundingClientRect();
  const rightRect = rightBtn.getBoundingClientRect();
  const containerRect = document
    .getElementById("matching-wrapper")
    .getBoundingClientRect();

  const x1 = leftRect.right - containerRect.left;
  const y1 = leftRect.top + leftRect.height / 2 - containerRect.top;

  const x2 = rightRect.left - containerRect.left;
  const y2 = rightRect.top + rightRect.height / 2 - containerRect.top;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "white");
  line.setAttribute("stroke-width", "3");

  wireLayer.appendChild(line);

  return line;
}

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

    const leftCid = leftBtn.dataset.cid;
const rightCid = rightBtn.dataset.cid;

// --- Remove existing connection for this LEFT concept ---
if (connectionLines.has(leftCid)) {
  wireLayer.removeChild(connectionLines.get(leftCid));
  connectionLines.delete(leftCid);
  selectedPairs.delete(leftCid);
}

// --- Remove existing connection for this RIGHT concept ---
for (const [lCid, rCid] of selectedPairs.entries()) {
  if (rCid === rightCid) {
    if (connectionLines.has(lCid)) {
      wireLayer.removeChild(connectionLines.get(lCid));
      connectionLines.delete(lCid);
    }
    selectedPairs.delete(lCid);
    break;
  }
}

// --- Create new connection ---
selectedPairs.set(leftCid, rightCid);
const line = drawConnection(leftBtn, rightBtn);
connectionLines.set(leftCid, line);

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
    // Remove all existing lines (if any)
    connectionLines.forEach(line => {
      if (line && line.parentNode === wireLayer) {
        wireLayer.removeChild(line);
      }
    });
    connectionLines.clear();

    // Clear pairing memory
    selectedPairs.clear();

    renderMatchingL5(targetLang, supportLang);
  }, 1000);
}
  };
}

// -------------------------
// Level 6 – Sentence Builder (Slot-based)
// -------------------------
function renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept) {

  subtitle.textContent = "Level 6";

let disambiguation = "";

if (tpl.concepts.includes("SECOND_PERSON_PLURAL")) {
  disambiguation = "(plural)";
}
else if (tpl.concepts.includes("SECOND_PERSON")) {
  disambiguation = "(singular)";
}

const supportSentence = safe(buildSentence(supportLang, tpl));

const ordered = orderedConceptsForTemplate(tpl, targetLang);

const subjectCid = ordered.find(c =>
  window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
);

const correctWords = ordered.map(cid => {
  const meta = window.GLOBAL_VOCAB.concepts[cid];
  if (!meta) return String(cid).toLowerCase();

  if (meta.type === "verb") {
    return String(getVerbForm(cid, subjectCid, targetLang)).toLowerCase();
  }

  return String(formOf(targetLang, cid)).toLowerCase();
});

  const wordBank = shuffle([...correctWords]);

  const assignments = new Map(); // slotIndex → word
  let selectedWord = null;

  content.innerHTML = `
  <div style="margin-bottom:20px;">
    <strong>${supportSentence}</strong>
    ${disambiguation ? `<div style="font-size:12px;opacity:0.7;margin-top:4px;">${disambiguation}</div>` : ""}
  </div>

    <div id="slot-container" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;"></div>

    <div id="word-bank" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;"></div>

    <div style="text-align:center;">
      <button id="check-l6">${ui("check")}</button>
    </div>
  `;

  const slotContainer = document.getElementById("slot-container");
  const bankContainer = document.getElementById("word-bank");

  // Create slots
  correctWords.forEach((_, index) => {
    const slot = document.createElement("div");
    slot.className = "sentence-slot";
    slot.dataset.index = index;
    slot.style.minWidth = "60px";
    slot.style.padding = "8px 12px";
    slot.style.borderRadius = "8px";
    slot.style.backgroundColor = "#3e1f4f";
    slot.style.border = "2px solid white";
    slot.style.color = "white";
    slot.style.textAlign = "center";
    slot.style.cursor = "pointer";

    slot.onclick = () => {
      const i = Number(slot.dataset.index);

      // If slot already filled → return word to bank
      if (assignments.has(i)) {
        const returnedWord = assignments.get(i);
        assignments.delete(i);
        slot.textContent = "";
        createBankWord(returnedWord);
      }
    };

    slotContainer.appendChild(slot);
  });

  // Create word bank items
  function createBankWord(word) {
  const btn = document.createElement("button");
  btn.textContent = word;

  btn.onclick = () => {
    speak(word, targetLang);

    if (selectedWord && selectedWord !== btn) {
      selectedWord.classList.remove("selected");
    }

    selectedWord = btn;
    btn.classList.add("selected");
  };

  bankContainer.appendChild(btn);
}

  wordBank.forEach(createBankWord);

  // Slotting logic
  slotContainer.addEventListener("click", e => {
    if (!selectedWord) return;

    const slot = e.target.closest(".sentence-slot");
    if (!slot) return;

    const slotIndex = Number(slot.dataset.index);
    const word = selectedWord.textContent;

    // If slot already filled, return previous word
    if (assignments.has(slotIndex)) {
      const oldWord = assignments.get(slotIndex);
      createBankWord(oldWord);
    }

    assignments.set(slotIndex, word);
    slot.textContent = word;

    selectedWord.remove();
    selectedWord = null;
  });

  document.getElementById("check-l6").onclick = () => {

  const builtWords = correctWords.map((_, i) => assignments.get(i) || "");

const isCorrect = builtWords.every((w, i) => 
  w.toLowerCase() === correctWords[i].toLowerCase()
);

if (isCorrect) {

  // Visual confirmation (green slots)
  document.querySelectorAll(".sentence-slot").forEach(slot => {
    slot.style.backgroundColor = "#4CAF50";
  });

  const tState = ensureTemplateProgress(tpl);

tState.streak++;
tState.lastResult = true;
tState.lastShownAt = run.exerciseCounter;

if (tState.streak >= 2) {
  tState.completed = true;
}

  setTimeout(() => renderNext(targetLang, supportLang), 800);
} else {
  // Visual feedback (red slots)
  document.querySelectorAll(".sentence-slot").forEach(slot => {
    slot.style.backgroundColor = "#D32F2F";
  });

 const tState = ensureTemplateProgress(tpl);

tState.streak = 0;
tState.lastResult = false;
tState.lastShownAt = run.exerciseCounter;

  setTimeout(() => renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept), 1000);
}
  };
}
// -------------------------
// Level 7 – Free Sentence Production
// -------------------------
function renderFreeProductionL7(targetLang, supportLang, tpl) {

  subtitle.textContent = "Level 7";

 let supportSentence = safe(tpl.render?.[supportLang]);
let disambiguation = "";

if (tpl.concepts.includes("SECOND_PERSON_PLURAL")) {
  disambiguation = "(plural)";
}
else if (tpl.concepts.includes("SECOND_PERSON")) {
  disambiguation = "(singular)";
}

const targetSentence = safe(buildSentence(targetLang, tpl));

  content.innerHTML = `
  <div style="margin-bottom:20px;">
    <strong>${supportSentence}</strong>
    ${disambiguation ? `<div style="font-size:12px;opacity:0.7;margin-top:4px;">${disambiguation}</div>` : ""}
  </div>
  
    <div style="margin-bottom:20px;">
      <input id="l7-input" type="text" style="
        width:100%;
        padding:10px;
        font-size:16px;
        border-radius:8px;
        border:2px solid white;
        background:#3e1f4f;
        color:white;
      " />
    </div>

    <div style="text-align:center;">
      <button id="check-l7">${ui("check")}</button>
    </div>

    <div id="l7-feedback" style="margin-top:15px;text-align:center;"></div>
  `;

  function normalizeStrict(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[.!?。！？]$/, "");
  }

  function normalizeLoose(str) {
    return normalizeStrict(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const checkBtn = document.getElementById("check-l7");
const feedbackDiv = document.getElementById("l7-feedback");
const inputField = document.getElementById("l7-input");

checkBtn.onclick = () => {

  const userInput = inputField.value;

  const strictUser = normalizeStrict(userInput);
  const strictCorrect = normalizeStrict(targetSentence);

  const looseUser = normalizeLoose(userInput);
  const looseCorrect = normalizeLoose(targetSentence);

  const tState = ensureTemplateProgress(tpl);

  let resultType = null;

  if (strictUser === strictCorrect) {
    resultType = "perfect";
  }
  else if (looseUser === looseCorrect) {
    resultType = "accent";
  }
  else {
    resultType = "incorrect";
  }

  // 🔒 Update progression state
  if (resultType === "perfect" || resultType === "accent") {

    tState.reinforcementStage++;
    tState.lastShownAt = run.exerciseCounter;

    if (tState.reinforcementStage >= 3) {
      tState.completed = true;
    }

  } else {
    tState.reinforcementStage = 0;
    tState.lastShownAt = run.exerciseCounter;
  }

  // 🎨 Visual Feedback
  inputField.disabled = true;

  if (resultType === "perfect") {
    inputField.style.borderColor = "#4CAF50";
    feedbackDiv.innerHTML = `<div style="color:#4CAF50;">Correct.</div>`;
  }

  if (resultType === "accent") {
    inputField.style.borderColor = "#4CAF50";
    feedbackDiv.innerHTML = `
      <div style="color:#4CAF50;">
        ${ui("correct")}.<br/>
        Proper form: <strong>${targetSentence}</strong>
      </div>`;
  }

  if (resultType === "incorrect") {
    inputField.style.borderColor = "#D32F2F";
    feedbackDiv.innerHTML = `
      <div style="color:#D32F2F;">
        ${ui("incorrect")}.<br/>
        Correct answer: <strong>${targetSentence}</strong>
      </div>`;
  }

  // 🔁 Replace Check with Continue
  checkBtn.textContent = "Continue";
  checkBtn.onclick = () => {
    setTimeout(() => renderNext(targetLang, supportLang), 0);
return;
  };
};
}

  async function enterLanguage(langCode) {

  languageState.target = langCode;

  await loadAndMergeVocab();
  await loadTemplates();

  BUNDLE_INDEX = buildBundleIndex();

  if (!USER.runs[langCode]) {
    run = createRunState();

    // 👇 NEW STEP
    languageScreen.classList.remove("active");
    document.getElementById("pack-screen").classList.add("active");

    renderPackSelection();

    return;
  }

  run = USER.runs[langCode];

  languageScreen.classList.remove("active");
  learningScreen.classList.add("active");

  renderNext(languageState.target, languageState.support);
}


 
function endSession(targetLang, supportLang) {

  run.sessionNumber++;

 releaseNextBundle(run);

  run.sessionComplete = false;
  run.sessionAttempts = {};
  run.sessionLevelUps = {};

  USER.runs[languageState.target] = run;
  saveUser();

  content.innerHTML = `
    <h2>Session Complete</h2>
    <p>Session ${run.sessionNumber - 1} finished.</p>
    <button id="start-next-session">${ui("continue")}</button>
  `;

  document.getElementById("start-next-session").onclick = () => {
    setTimeout(() => renderNext(targetLang, supportLang), 0);
return;
  };
}
  const TYPE_PRIORITY = {
  pronoun: 1,
  verb: 2,
  noun: 3,
  adjective: 4,
  number: 5,
  connector: 6,
  quantifier: 7
};
function chooseConcept(excluded = new Set()) {

  const candidates = run.released.filter(cid => {

    if (excluded.has(cid)) return false;

    const st = ensureProgress(cid);

    if (st.completed) return false;
    const attempts = run.sessionAttempts?.[cid] || 0;
const levelUps = run.sessionLevelUps?.[cid] || 0;

if (attempts >= 8 || levelUps >= 3) return false;
    if (!passesSpacingRule(cid)) return false;

    const hasTemplate = TEMPLATE_CACHE.some(tpl =>
      tpl.concepts.includes(cid) &&
      templateEligible(tpl)
    );

    // Prevent concept starvation
    const meta = window.GLOBAL_VOCAB.concepts[cid];

// adjectives and numbers do not require templates
if (meta?.type === "adjective" || meta?.type === "number") {
  return true;
}

// Prevent concept starvation for other types
if (!hasTemplate) {
  return false;
}

return true;

  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {

    const levelDiff = levelOf(a) - levelOf(b);
    if (levelDiff !== 0) return levelDiff;

    const typeA = window.GLOBAL_VOCAB.concepts[a]?.type;
    const typeB = window.GLOBAL_VOCAB.concepts[b]?.type;

    const pa = TYPE_PRIORITY[typeA] || 99;
    const pb = TYPE_PRIORITY[typeB] || 99;

    return pa - pb;

  });

  return candidates[0];
}
function chooseTemplateForConcept(cid) {

  const meta = window.GLOBAL_VOCAB.concepts[cid];

  let eligible;

  // Modifier concepts (adjective/number)
  if (meta?.type === "adjective" || meta?.type === "number") {

    eligible = TEMPLATE_CACHE.filter(tpl =>
      tpl.concepts.some(c =>
        window.GLOBAL_VOCAB.concepts[c]?.type === "noun"
      ) &&
      templateEligible(tpl)
    );

  } else {

    // 🔥 PRIMARY MATCH
    eligible = TEMPLATE_CACHE.filter(tpl =>
      tpl.concepts.includes(cid) &&
      templateEligible(tpl)
    );

    // 🔥 FALLBACK — THIS IS THE KEY FIX
    if (!eligible.length) {
      eligible = TEMPLATE_CACHE.filter(templateEligible);
    }

  }

  if (!eligible.length) return null;

  return eligible[Math.floor(Math.random() * eligible.length)];
}
function renderNext(targetLang, supportLang) {
  if (!run) return;


  if (run.sessionComplete) {
    return endSession(targetLang, supportLang);
  }

  const excluded = new Set();

  for (let attempts = 0; attempts < 25; attempts++) {
    const targetConcept = chooseConcept(excluded);

    run.lastTargetConcept = targetConcept;

   if (!targetConcept) {

  // 🔥 Check if ANY concept is truly renderable
  const canRenderSomething = run.released.some(c => {

    const s = ensureProgress(c);

    if (s.completed) return false;

    const attempts = run.sessionAttempts?.[c] || 0;
    const levelUps = run.sessionLevelUps?.[c] || 0;

    if (attempts >= 8 || levelUps >= 3) return false;

    if (!passesSpacingRule(c)) return false;

    const meta = window.GLOBAL_VOCAB.concepts[c];

    // Modifiers are always renderable
    if (meta?.type === "adjective" || meta?.type === "number") {
      return true;
    }

    // 🔥 KEY: must have at least ONE eligible template
    return TEMPLATE_CACHE.some(tpl =>
      tpl.concepts.includes(c) &&
      templateEligible(tpl)
    );

  });

  // 🔥 If nothing can render → END SESSION
  if (!canRenderSomething) {
    run.sessionComplete = true;
    return endSession(targetLang, supportLang);
  }

  // 🔥 Otherwise: try again safely
  decrementCooldowns();
  setTimeout(() => renderNext(targetLang, supportLang), 0);
  return;
}
    const tpl = chooseTemplateForConcept(targetConcept);

    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    const level = levelOf(targetConcept);
// ---------- Level 2 strict option rule ----------
if (level === 2) {
  const meta = window.GLOBAL_VOCAB.concepts[targetConcept];

  const role =
    meta?.type === "pronoun" ? "pronoun" :
    meta?.type === "verb" ? "verb" :
    "object";

  const q = tpl.questions?.[role];

  if (!q) {
    excluded.add(targetConcept);
    continue;
  }

  const releasedOptions = q.choices.filter(opt =>
    run.released.includes(opt)
  );

  if (releasedOptions.length !== 4) {
    excluded.add(targetConcept);
    continue;
  }
}
    if (level === 2) {
  const result = renderComprehension(targetLang, supportLang, tpl, targetConcept);

  if (!result) {
    excluded.add(targetConcept);
    continue;
  }

  run.exerciseCounter++;
  return;
}

    if (level === 1) {
      renderExposure(targetLang, supportLang, tpl, targetConcept);
      run.exerciseCounter++;
      return;
    }

    if (level === 3) {
      renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);
      run.exerciseCounter++;
      return;
    }

    if (level === 4) {

      const result = renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);

      if (result === null) {
        excluded.add(targetConcept);
        continue;
      }

      run.exerciseCounter++;
      return;
    }

    if (level === 5) {
      renderMatchingL5(targetLang, supportLang);
      run.exerciseCounter++;
      return;
    }

    if (level === 6) {
      renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept);
      run.exerciseCounter++;
      return;
    }

    if (level === 7) {
      renderFreeProductionL7(targetLang, supportLang, tpl);
      run.exerciseCounter++;
      return;
    }

    excluded.add(targetConcept);
  }

  // If we tried everything and still couldn't render anything
const remainingActive = run.released.filter(c => {

  const s = ensureProgress(c);

  if (s.completed) return false;

  const attempts = run.sessionAttempts?.[c] || 0;
  const levelUps = run.sessionLevelUps?.[c] || 0;

  if (attempts >= 8 || levelUps >= 3) return false;

  if (!passesSpacingRule(c)) return false;

  const meta = window.GLOBAL_VOCAB.concepts[c];

  if (meta?.type === "adjective" || meta?.type === "number") {
    return true;
  }

  const hasTemplate = TEMPLATE_CACHE.some(tpl =>
    tpl.concepts.includes(c) &&
    tpl.concepts.every(cid => run.released.includes(cid))
  );

  return hasTemplate;
});

// ✅ If nothing left → END SESSION
if (remainingActive.length === 0) {
  run.sessionComplete = true;
  return endSession(targetLang, supportLang);
}

// Otherwise try again safely
setTimeout(() => renderNext(targetLang, supportLang), 0);
return;
}


  openAppBtn.addEventListener("click", () => {
  startScreen.classList.remove("active");
  languageScreen.classList.add("active");
});
document.getElementById("start-run").onclick = () => {

  if (!run.selectedResourcePacks || run.selectedResourcePacks.length === 0) {
    alert("Select at least 1 resource pack");
    return;
  }

  run.releasePlan = buildReleasePlan(run.selectedResourcePacks);
  run.releasePlanIndex = 0;

  // ✅ FIXED
  for (let i = 0; i < 2; i++) {
    releaseNextBundle(run);
  }

  run.setupComplete = true;

  USER.runs[languageState.target] = run;
  saveUser();

  document.getElementById("pack-screen").classList.remove("active");
  learningScreen.classList.add("active");

  renderNext(languageState.target, languageState.support);
};

    

 function returnToHome() {
  learningScreen.classList.remove("active");
  languageScreen.classList.remove("active");
  startScreen.classList.add("active");
}

if (quitBtn) {
  quitBtn.addEventListener("click", returnToHome);
}

if (hubQuitBtn) {
  hubQuitBtn.addEventListener("click", returnToHome);
}
window.__app = { get run(){ return run; } };
});
