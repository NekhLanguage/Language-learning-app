import { AVAILABLE_LANGUAGES } from "./languages.js?v=0.9.99.14";
import { speakAlways, speakWithHighlight, speakLetters, prefetchTTS, setVoiceMap } from "./audioengine.js";
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

  { id: "core_21", concepts: ["ROOM", "AND", "BUT", "NOT", "TO"] },

  { id: "core_22", concepts: ["BECAUSE", "IF", "THIS", "THAT", "WITH"] },

  { id: "core_23", concepts: ["RED","BLUE","GREEN","YELLOW","PURPLE"] },

{ id: "core_24", concepts: ["ORANGE","TODAY","YESTERDAY","TOMORROW","NOW"] },

{ id: "core_25", concepts: ["BEFORE","AFTER","WHY","WHO","WHEN"] },

{ id: "core_26", concepts: ["WHERE","HOW","WHICH","WHAT","ALL"] },

{ id: "core_27", concepts: ["TOP","BOTTOM","UNDER","NEXT_TO","FRONT"] },

{ id: "core_28", concepts: ["BEHIND","IN","ON","OFF","BETWEEN"] },

{ id: "core_29", concepts: ["BACK","OUT","NORTH","SOUTH","EAST"] },

{ id: "core_30", concepts: ["WEST","LONG","SHORT","HEAVY","LIGHT"] },

{ id: "core_31", concepts: ["DARK","YOUNG","EASY","DIFFICULT","RIGHT"] },

{ id: "core_32", concepts: ["LEFT","CORRECT","WRONG","NICE","YEAR"] },

{ id: "core_33", concepts: ["MONTH","WEEK","DAY","HOUR","MINUTE"] },

{ id: "core_34", concepts: ["SECOND","MORNING","NIGHT","WINTER","SUMMER"] },

{ id: "core_35", concepts: ["SPRING","AUTUMN","THING","PLEASE","MAYBE"] },

{ id: "core_36", concepts: ["THANKS","FOR","ANY","NEXT","LATER"] },

{ id: "core_37", concepts: ["AS","WHILE","MAY","SOMETHING","JUST"] },

{ id: "core_38", concepts: ["ANOTHER","FROM","AROUND","ONLY","BY"] },

{ id: "core_39", concepts: ["YES","NO","IT","ITS","MINE"] },

{ id: "core_40", concepts: ["YOURS","HERS","OURS","THEIRS"] }
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

{ id: "pokemon_10", concepts: ["STRONG","EFFECTIVE","SUPER_EFFECTIVE","VERY_EFFECTIVE","LEGENDARY","SHINY"] }

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

    { id: "cook_10", concepts: ["SOUR","FRESH","FROZEN","RAW","HEAT"] }

  ]
},
  anime: {
  vocabFile: "anime.json",
  templateFile: "sentence_templates_anime.json",
  beta: true,
  bundles: [

    { id: "anime_01", concepts: ["HERO","VILLAIN","WARRIOR","RIVAL","DRAGON"] },

    { id: "anime_02", concepts: ["NINJA","SAMURAI","SENSEI","MASTER","CLAN"] },

    { id: "anime_03", concepts: ["SWORD","ARMOR","SHIELD","CRYSTAL","SCROLL"] },

    { id: "anime_04", concepts: ["ATTACK","DEFEND","STRIKE","DODGE","PROTECT"] },

    { id: "anime_05", concepts: ["SUMMON","TRANSFORM","CHANNEL","UNLEASH","AWAKEN"] },

    { id: "anime_06", concepts: ["SPIRIT","DEMON","SHADOW","PORTAL","MECHA"] },

    { id: "anime_07", concepts: ["KINGDOM","TEMPLE","ARENA","QUEST","DESTINY"] },

    { id: "anime_08", concepts: ["BRAVE","FIERCE","MIGHTY","SINISTER","POWERFUL"] },

    { id: "anime_09", concepts: ["ANCIENT","CURSED","SACRED","LEGENDARY","ETERNAL"] },

    { id: "anime_10", concepts: ["BATTLE","TRAIN","CONQUER","TRANSCEND","POWER"] }

  ]
},
  football: {
  vocabFile: "football.json",
  templateFile: "sentence_templates_football.json",
  beta: true,
  bundles: [

    { id: "football_01", concepts: ["PITCH","GOAL","NET","STADIUM","WHISTLE"] },

    { id: "football_02", concepts: ["STRIKER","GOALKEEPER","CAPTAIN","REFEREE","COACH"] },

    { id: "football_03", concepts: ["KICK","PASS","SHOOT","DRIBBLE","SCORE"] },

    { id: "football_04", concepts: ["HEADER","TACKLE","CROSS","VOLLEY","SPRINT"] },

    { id: "football_05", concepts: ["FOUL","PENALTY","CORNER","OFFSIDE","HALFTIME"] },

    { id: "football_06", concepts: ["SQUAD","FORMATION","LEAGUE","SUBSTITUTE","ASSIST"] },

    { id: "football_07", concepts: ["MATCH","VICTORY","DEFEAT","DRAW","TROPHY"] },

    { id: "football_08", concepts: ["SWIFT","SKILLED","AGGRESSIVE","DECISIVE","CLINICAL"] },

    { id: "football_09", concepts: ["INTERCEPT","DEFEND","BLOCK","COUNTER","DOMINATE"] },

    { id: "football_10", concepts: ["CHAMPION","CROWD","CELEBRATE","FINAL","UNBEATABLE"] }

  ]
},
  music: {
  vocabFile: "music.json",
  templateFile: "sentence_templates_music.json",
  beta: true,
  bundles: [

    { id: "music_01", concepts: ["GUITAR","DRUM","PIANO","VIOLIN","MICROPHONE"] },

    { id: "music_02", concepts: ["MELODY","RHYTHM","BEAT","CHORD","HARMONY"] },

    { id: "music_03", concepts: ["SING","STRUM","COMPOSE","PERFORM","RECORD"] },

    { id: "music_04", concepts: ["CONCERT","STAGE","ENCORE","SPOTLIGHT","TOUR"] },

    { id: "music_05", concepts: ["LYRIC","CHORUS","VERSE","SOLO","DUET"] },

    { id: "music_06", concepts: ["ROCK","JAZZ","CLASSICAL","ACOUSTIC","ELECTRONIC"] },

    { id: "music_07", concepts: ["STUDIO","TRACK","ALBUM","REMIX","SAMPLE"] },

    { id: "music_08", concepts: ["REHEARSE","TUNE","IMPROVISE","AMPLIFY","DROP"] },

    { id: "music_09", concepts: ["LOUD","SOULFUL","RHYTHMIC","LIVE","VIRAL"] },

    { id: "music_10", concepts: ["BAND","ANTHEM","PLAYLIST","FESTIVAL","FANBASE"] }

  ]
},
  everyday_life: {
  vocabFile: "everyday_life.json",
  templateFile: "sentence_templates_everyday_life.json",
  beta: true,
  bundles: [

    { id: "el_01", concepts: ["ALARM","SHOWER","TOOTHBRUSH","APARTMENT","LIVING_ROOM"] },

    { id: "el_02", concepts: ["FURNITURE","NEIGHBOR","GROCERY","PHARMACY","OFFICE"] },

    { id: "el_03", concepts: ["MEETING","DEADLINE","STORM","UMBRELLA","FORECAST"] },

    { id: "el_04", concepts: ["INVITATION","CONVERSATION","COMPLIMENT","WALLET","BILL"] },

    { id: "el_05", concepts: ["BUDGET","HEADACHE","MEDICINE","APPOINTMENT","LAUNDRY"] },

    { id: "el_06", concepts: ["DISHES","GARBAGE","CANDLE","COUCH","COMMUTE"] },

    { id: "el_07", concepts: ["OVERSLEEP","DELIVER","ORGANIZE","SCHEDULE","DRIZZLE"] },

    { id: "el_08", concepts: ["APOLOGIZE","AFFORD","EXERCISE","REPAIR","RELAX"] },

    { id: "el_09", concepts: ["UNWIND","COMFORTABLE","CONVENIENT","BUSY","CLOUDY"] },

    { id: "el_10", concepts: ["FRIENDLY","CHEAP","TIRED","MESSY","COZY"] }

  ]
},
  fashion_style: {
  vocabFile: "fashion_style.json",
  templateFile: "sentence_templates_fashion_style.json",
  beta: true,
  bundles: [

    { id: "fs_01", concepts: ["JACKET","DRESS","SNEAKERS","FABRIC","LEATHER"] },

    { id: "fs_02", concepts: ["SILK","PATTERN","STITCH","TAILOR","RUNWAY"] },

    { id: "fs_03", concepts: ["MODEL","COLLECTION","BOUTIQUE","WARDROBE","TREND"] },

    { id: "fs_04", concepts: ["NECKLACE","BRACELET","SUNGLASSES","MAKEUP","LIPSTICK"] },

    { id: "fs_05", concepts: ["HAIRSTYLE","OUTFIT","LOOKBOOK","AESTHETIC","DESIGNER"] },

    { id: "fs_06", concepts: ["BRAND","CAMPAIGN","INFLUENCER","EDITORIAL","COUTURE"] },

    { id: "fs_07", concepts: ["EMBROIDER","DRAPE","DESIGN","STRUT","BROWSE"] },

    { id: "fs_08", concepts: ["ADORN","CONTOUR","COORDINATE","UNVEIL","SHOWCASE"] },

    { id: "fs_09", concepts: ["ELEGANT","TEXTURED","VINTAGE","GLAMOROUS","AFFORDABLE"] },

    { id: "fs_10", concepts: ["DAZZLING","FLAWLESS","CHIC","EXCLUSIVE","ICONIC"] }

  ]
},
  gaming: {
  vocabFile: "gaming.json",
  templateFile: "sentence_templates_gaming.json",
  beta: true,
  bundles: [

    { id: "gm_01", concepts: ["CONSOLE","CONTROLLER","SCREEN","TIER","PIXEL"] },

    { id: "gm_02", concepts: ["AVATAR","BOSS","NPC","COMPANION","COMBO"] },

    { id: "gm_03", concepts: ["HARM","VITALITY","MISSION","ACHIEVEMENT","UPGRADE"] },

    { id: "gm_04", concepts: ["DUNGEON","SPAWN","MAP","PARTY","RAID"] },

    { id: "gm_05", concepts: ["GUILD","INVENTORY","VIAL","GEM","LOADOUT"] },

    { id: "gm_06", concepts: ["COOLDOWN","STRATEGY","LEADERBOARD","RANK","SPEEDRUN"] },

    { id: "gm_07", concepts: ["RESPAWN","LOOT","CRAFT","EQUIP","GRIND"] },

    { id: "gm_08", concepts: ["SLAY","UNLOCK","ROAM","STREAM","COLLECT"] },

    { id: "gm_09", concepts: ["AMBUSH","CLUTCH","ELITE","CRITICAL","RARE"] },

    { id: "gm_10", concepts: ["HIDDEN","COMPETITIVE","MYTHIC","TACTICAL","OVERPOWERED"] }

  ]
},
  tourism: {
  vocabFile: "tourism.json",
  templateFile: "sentence_templates_tourism.json",
  beta: true,
  bundles: [

    { id: "tour_01", concepts: ["AIRPORT","PASSPORT","FLIGHT","LUGGAGE","HOTEL"] },

    { id: "tour_02", concepts: ["RESERVATION","LOBBY","CHECKOUT","TAXI","STATION"] },

    { id: "tour_03", concepts: ["TICKET","ROUTE","LANDMARK","MUSEUM","MONUMENT"] },

    { id: "tour_04", concepts: ["RESTAURANT","MENU","WAITER","MARKET","SOUVENIR"] },

    { id: "tour_05", concepts: ["BARGAIN","PHRASEBOOK","BEACH","CATHEDRAL","HARBOR"] },

    { id: "tour_06", concepts: ["CURRENCY","CUSTOMS","EMBASSY","ADVENTURE","ITINERARY"] },

    { id: "tour_07", concepts: ["GUIDE","BOARD","RESERVE","NAVIGATE","PHOTOGRAPH"] },

    { id: "tour_08", concepts: ["ORDER","PURCHASE","TRANSLATE","GREET","PRONOUNCE"] },

    { id: "tour_09", concepts: ["EXPLORE","EXCHANGE","INSURE","RECOMMEND","SCENIC"] },

    { id: "tour_10", concepts: ["DELICIOUS","EXPENSIVE","FOREIGN","HISTORIC","UNFORGETTABLE"] }

  ]
},
  space_scifi: {
  vocabFile: "space_scifi.json",
  templateFile: "sentence_templates_space_scifi.json",
  beta: true,
  bundles: [

    { id: "space_01", concepts: ["PLANET","STAR","GALAXY","ASTEROID","COSMIC"] },

    { id: "space_02", concepts: ["ROCKET","SPACECRAFT","ASTRONAUT","LAUNCH","ORBITAL"] },

    { id: "space_03", concepts: ["TELESCOPE","SATELLITE","PROBE","DISCOVER","DISTANT"] },

    { id: "space_04", concepts: ["ALIEN","CREATURE","SIGNAL","ENCOUNTER","UNKNOWN"] },

    { id: "space_05", concepts: ["LASER","HOLOGRAM","ANDROID","ACTIVATE","ADVANCED"] },

    { id: "space_06", concepts: ["COCKPIT","AIRLOCK","HULL","NAVIGATE","ARTIFICIAL"] },

    { id: "space_07", concepts: ["NEBULA","WORMHOLE","SUPERNOVA","ORBIT","INFINITE"] },

    { id: "space_08", concepts: ["COLONY","HABITAT","TERRAFORM","COLONIZE","SUSTAINABLE"] },

    { id: "space_09", concepts: ["INVASION","FLEET","BLASTER","TRANSMIT","HOSTILE"] },

    { id: "space_10", concepts: ["DIMENSION","FRONTIER","WARP","EVOLVE","FUTURISTIC"] }

  ]
}
};

// Concepts the learner needs to *recognise* far more than they need to *produce*.
// These plateau at Level 4 (isolated recall) instead of Level 7 (free production).
// Decided purely by concept ID — no vocab file is modified.
const RECOGNITION_CONCEPTS = new Set([
  // Numbers 11-20 — learners almost always see these as digits in running text;
  // the word form is high-recognition, low-production.
  "ELEVEN","TWELVE","THIRTEEN","FOURTEEN","FIFTEEN",
  "SIXTEEN","SEVENTEEN","EIGHTEEN","NINETEEN","TWENTY",
  // Seasons — appear in descriptive text, rarely spoken in isolation.
  "SPRING","SUMMER","AUTUMN","WINTER",
  // Time units — "wait 5 minutes" read; "wait a bit" said.
  "HOUR","MINUTE","SECOND",
  // Temporal relations — input-heavy (reading/listening); spoken work usually
  // carries tense, not these exact words.
  "BEFORE","AFTER","LATER","NEXT","NOW",
  // Cardinal directions — maps, stories, weather; rarely produced.
  "NORTH","SOUTH","EAST","WEST",
  // Standalone possessive pronouns — MY/YOUR/HIS/HER/OUR/THEIR already cover
  // production via attribution ("my book"); the standalone forms are uncommon.
  "MINE","YOURS","HERS","OURS","THEIRS","ITS",
  // Secondary quantifiers — ALL stays productive; these are input-only for most.
  "ANY","ONLY","ANOTHER","SOMETHING",
  // Lower-frequency connectors — AND/BUT/BECAUSE/IF stay productive;
  // WHILE/AS/ALSO learners parse far more often than they speak.
  "WHILE","AS","ALSO",
  // Modals and other function words — recognition is sufficient for comprehension,
  // production can lean on simpler alternatives the learner has at production level.
  "MAY","AROUND"
]);

// One-shot reconciliation: if an existing learner already has a recognition
// concept at Level 4 or higher, flip it to completed now so their roadmap and
// milestone counts reflect the new bar immediately (rather than waiting until
// the next exercise touches the concept).
function reconcileRecognitionCompletion(user) {
  if (!user || !user.runs) return;
  for (const run of Object.values(user.runs)) {
    const progress = run && run.progress;
    if (!progress) continue;
    for (const cid of Object.keys(progress)) {
      const p = progress[cid];
      if (!p || p.completed) continue;
      if (RECOGNITION_CONCEPTS.has(cid) && (p.level || 0) >= 4) {
        p.completed = true;
      }
    }
  }
}

// Fluency-aware spaced repetition: time an exercise from the moment it
// renders to the moment the learner answers, and use that response time to
// modulate the cooldown. Correctness criteria are unchanged — speed only
// affects *when* the concept resurfaces, never whether it counts as correct.
// Fast correct → long cooldown (concept feels owned).
// Slow correct → short cooldown (bring it back soon; needs reinforcement).
let currentExerciseStartedAt = 0;
function markExerciseStart() { currentExerciseStartedAt = Date.now(); }
function exerciseElapsedMs() {
  return currentExerciseStartedAt ? Date.now() - currentExerciseStartedAt : 0;
}
function cooldownForElapsed(ms) {
  if (ms <= 0) return 4;          // no timing signal — treat as normal
  if (ms < 4000) return 8;         // fast: push review further out
  if (ms > 15000) return 2;        // slow: bring it back soon
  return 4;                         // normal
}

let USER = null;
document.addEventListener("DOMContentLoaded", async () => {
  const APP_VERSION = "v1.0.0";
  const MAX_LEVEL = 7;
  const DEV_START_AT_LEVEL_7 = false; // set false after stress testing
  const CONTENT_VERSION = 13;

  const startScreen = document.getElementById("start-screen");
  const learningScreen = document.getElementById("learning-screen");
  const openAppBtn = document.getElementById("open-app");
const quitBtn = document.getElementById("quit-learning");
const hubQuitBtn = document.getElementById("hub-quit");
const resetBtn = document.getElementById("reset-user");
const logoutBtn = document.getElementById("logout-btn");
const content = document.getElementById("content");
  const subtitle = document.getElementById("session-subtitle");
  const languageScreen = document.getElementById("language-screen");
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

async function saveUser() {

  if (!USER || !USER.runs) return;

  USER.lastLocalChange = Date.now();

  localStorage.setItem("zth_user", JSON.stringify(USER));

  const email = localStorage.getItem("zth_email")?.toLowerCase();
  if (!email) return;

  try {
    await fetch("/.netlify/functions/saveUser", {
      method: "POST",
      body: JSON.stringify({
        email,
        user: USER
      })
    });

    USER.lastSyncedAt = Date.now();

    // 🔥 THIS IS THE KEY LINE
    await loadUserFromServer(email);

  } catch (err) {
    console.warn("Sync failed:", err);
  }
}
// Built from languages.js — no manual edits needed when adding a language
const SUPPORT_LANGUAGES = Object.fromEntries(
  AVAILABLE_LANGUAGES.map(l => [l.code, { short: l.short, label: l.nativeLabel }])
);

// Wire TTS codes into audioengine from the same registry
setVoiceMap(Object.fromEntries(AVAILABLE_LANGUAGES.map(l => [l.code, l.ttsCode])));
const EXTERNAL_LINKS = {
  blueprint: "https://nekhslanguageblueprint.com",
  skool: "https://www.skool.com/nekhs-language-blueprint-7842",
  offer: "https://stan.store/Nekhslanguageblueprint/p/fluency-planning-call",
  buyAccess: "https://stan.store/Nekhslanguageblueprint/p/zero-to-hero-app-beta-copy"
};

// Launch-spike observability. Keep this tiny and self-contained: one global
// error listener, one unhandled-rejection listener, one delegated click
// listener that fires when any stan.store link is clicked. Everything posts
// to /.netlify/functions/beacon. See netlify/functions/beacon.js.
(function initBeacon() {
  const ENDPOINT = "/.netlify/functions/beacon";
  function send(type, payload) {
    try {
      const body = JSON.stringify({ type, payload });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
        .catch(() => {});
    } catch (_) { /* never let the beacon throw */ }
  }
  window.__zthBeacon = send;

  window.addEventListener("error", (e) => {
    send("error", {
      message: (e && e.message) || "error",
      source: (e && e.filename) || "",
      line: (e && e.lineno) || 0,
      col: (e && e.colno) || 0,
      stack: e && e.error && e.error.stack ? String(e.error.stack).slice(0, 1000) : "",
      path: location.pathname + location.search
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e && e.reason;
    const message =
      reason && reason.message ? reason.message :
      typeof reason === "string" ? reason :
      "unhandledrejection";
    send("error", {
      message: String(message).slice(0, 500),
      source: "unhandledrejection",
      line: 0,
      col: 0,
      stack: reason && reason.stack ? String(reason.stack).slice(0, 1000) : "",
      path: location.pathname + location.search
    });
  });

  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href^='https://stan.store/']") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const surface = a.id || (a.closest("[id]") && a.closest("[id]").id) || "unknown";
    let sessionCount = 0;
    let targetLang = "";
    try {
      const u = JSON.parse(localStorage.getItem("zth_user") || "{}");
      targetLang = (u && u.lastActiveLanguage) || "";
      const run = targetLang && u.runs && u.runs[targetLang];
      // sessionNumber is 1-indexed and points at the *current* session, so the
      // count already completed is one less (bounded at 0).
      if (run && typeof run.sessionNumber === "number") {
        sessionCount = Math.max(0, run.sessionNumber - 1);
      }
    } catch (_) {}
    let supportLang = "";
    try { supportLang = (typeof languageState !== "undefined" && languageState.support) || ""; } catch (_) {}
    send("cta_click", {
      href,
      surface,
      sessionCount,
      supportLang,
      targetLang
    });
  }, true);
})();

// ---------------------------------------------------------------
// Language file cache — one entry per language code, populated
// on demand.  UI strings, hub names, and vocab forms all live in
// lang/<code>.json so that adding a new language is a single file.
// ---------------------------------------------------------------
const LANG_FILE_CACHE = {};

async function getLangFileData(code) {
  if (!LANG_FILE_CACHE[code]) {
    try {
      const res = await fetch(`lang/${code}.json`);
      if (!res.ok) throw new Error(`Failed to load lang/${code}.json (${res.status})`);
      LANG_FILE_CACHE[code] = await res.json();
    } catch (err) {
      console.error(err);
      LANG_FILE_CACHE[code] = { uiStrings: {}, hubNames: {}, forms: {} };
    }
  }
  return LANG_FILE_CACHE[code];
}
 const supportPill = document.getElementById("support-pill");
const supportShort = document.getElementById("support-short");
const supportLabel = document.getElementById("support-label");
const supportDropdown = document.getElementById("support-dropdown");
const email = localStorage.getItem("zth_email")?.toLowerCase();

// Hydrate USER synchronously from localStorage so first paint doesn't wait on a
// Netlify function round-trip. The server sync runs in the background below and
// reconciles any drift when it resolves.
loadUser();
reconcileRecognitionCompletion(USER);
languageState.support = USER.supportLanguage || "en";

// Kick off both network fetches without awaiting. The <link rel="preload"> in
// index.html primes the lang file during HTML parse, so it's typically already
// in cache by the time this line runs.
const langP = getLangFileData(languageState.support);
const serverSyncP = email
  ? loadUserFromServer(email).catch(err => { console.warn("Server sync failed:", err); })
  : null;

if (email) {
  try {
    const targetLang = USER && USER.lastActiveLanguage || "";
    const run0 = targetLang && USER && USER.runs && USER.runs[targetLang];
    const sessionNumber = run0 && typeof run0.sessionNumber === "number" ? run0.sessionNumber : 0;
    if (window.__zthBeacon) {
      window.__zthBeacon("session_start", {
        email,
        targetLang,
        supportLang: languageState.support || "",
        sessionNumber,
        version: APP_VERSION
      });
    }
  } catch (_) { /* never let the beacon throw */ }
}

// Paint the support selector immediately from local state. The rest of the start
// screen comes from the HTML defaults until the lang file lands.
updateSupportUI(languageState.support);
let languageSearchQuery = "";

// First render once the lang file resolves — applies localized strings + hub names.
langP.then(() => {
  updateUIStrings(languageState.support);
  renderLanguageButtons();
});

// Once the server has caught up, reconcile: a different device may have changed
// the support language or pushed new progress; both need a re-render of the hub.
if (serverSyncP) {
  Promise.all([langP, serverSyncP]).then(async () => {
    reconcileRecognitionCompletion(USER);
    const newSupport = USER.supportLanguage || "en";
    if (newSupport !== languageState.support) {
      languageState.support = newSupport;
      await getLangFileData(newSupport);
      updateSupportUI(languageState.support);
      updateUIStrings(languageState.support);
    }
    renderLanguageButtons();
  });
}
async function loadUserFromServer(email) {
email = email?.toLowerCase().trim();
  const res = await fetch("/.netlify/functions/loadUser", {
    method: "POST",
    body: JSON.stringify({ email })
  });

  if (!res.ok) { console.error("loadUser failed:", res.status); return; }
  const data = await res.json();
  console.log("LOADED FROM SERVER", data.user);

  if (data.user) {
    USER = data.user;

    // 🔥 version migration only
    Object.keys(USER.runs || {}).forEach(lang => {
      const run = USER.runs[lang];
if (!run.contentVersion) {
  run.contentVersion = CONTENT_VERSION;
}

if (run.contentVersion !== CONTENT_VERSION) {

  console.warn(
    `Updating run from content version ${run.contentVersion} → ${CONTENT_VERSION}:`,
    lang
  );

  migrateRun(run, run.contentVersion, CONTENT_VERSION);

  run.contentVersion = CONTENT_VERSION;
}
    });

  } else {
    console.warn("No server user found → creating new");
    USER = createEmptyUser();
  }

  // ✅ ONLY save locally
  localStorage.setItem("zth_user", JSON.stringify(USER));
}

function hasAccess() {
  const email = localStorage.getItem("zth_email");
  return !!email;
}

if (!hasAccess()) {

  const supportLang = USER?.supportLanguage || "en";

  // UI strings come from the lang file cache (loaded at startup)
  let strings = LANG_FILE_CACHE[supportLang]?.uiStrings || LANG_FILE_CACHE["en"]?.uiStrings;

  if (!strings) {
    strings = {
      enterEmail: "Enter your email",
      continue: "Continue",
      buyAccess: "Not a user? Get access",
      noAccess: "No access found for this email"
    };
  }

  document.body.innerHTML = `
    <div style="text-align:center;margin-top:100px;">
      
      <h2>${strings.enterEmail || "Enter your email"}</h2>
      
      <input 
        id="email-input" 
        type="email"
        placeholder="your@email.com" 
        style="
          padding:8px;
          border-radius:6px;
          border:none;
          margin-top:10px;
        "
      />

      <br><br>

      <button id="login-btn" style="
        padding:12px 24px;
        border-radius:999px;
        border:none;
        font-weight:800;
        cursor:pointer;
      ">
        ${strings.continue}
      </button>

      <div style="margin:24px auto 0;text-align:center;max-width:300px;">

  <div style="font-size:0.9rem;opacity:0.85;margin-bottom:10px;">
    Start learning with the Zero to Hero app
  </div>

  <button 
    id="link-buy-access"
    style="
      padding:12px 24px;
      border-radius:999px;
      border:none;
      font-weight:800;
      cursor:pointer;
      background:white;
      color:#5a1f5f;
      width:100%;
    "
  >
  </button>

</div>

    </div>
  `;

  // 🔗 Wire BUY ACCESS link
  const buyAccess = document.getElementById("link-buy-access");

if (buyAccess) {
  buyAccess.textContent = "Get access to the app";

  buyAccess.onclick = () => {
  window.open(EXTERNAL_LINKS.buyAccess, "_blank");
};
}

  // 🔐 LOGIN LOGIC (unchanged, just slightly cleaned)
  document.getElementById("login-btn").onclick = async () => {

    const email = document.getElementById("email-input").value.trim().toLowerCase();

    const res = await fetch("/.netlify/functions/checkAccess", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    if (!res.ok) { alert("Server error — please try again."); return; }
    const data = await res.json();

    if (data.allowed) {
      localStorage.setItem("zth_email", email.toLowerCase());

      // 🔥 your sync logic
      await loadUserFromServer(email);

      location.reload();
    } else {
      alert(strings.noAccess || "No access found for this email");
    }
  };

  return;
}

  const VOCAB_FILES = [
    "adjectives.json","connectors.json","directions_positions.json",
    "glue_words.json","nouns.json","numbers.json",
    "politeness_modality.json","pronouns.json","quantifiers.json",
    "question_words.json","time_words.json","verbs.json", "pokemon.json", "harry_potter.json", "cooking.json",
    "anime.json", "football.json", "music.json"
  ];

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
    sessionExerciseCount: 0,
    sessionComplete: false,

    milestonesShown: [],

    contentVersion: CONTENT_VERSION
  };
}
function migrateRun(run, fromVersion, toVersion) {

  console.warn(`Migrating run from v${fromVersion} → v${toVersion}`);

  // -----------------------------
  // v11 → v12 (your current fix)
  // -----------------------------
  if (fromVersion < 12) {

    // Ensure required structures exist
    run.progress = run.progress || {};
    run.templateProgress = run.templateProgress || {};
    run.released = run.released || [];

    // Fix any missing concept progress entries
    (run.released || []).forEach(cid => {
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
    });

  }
if (fromVersion < 13) {
  // No structural changes needed
  // Display logic updated (surfaceForm + article handling)
}
  // -----------------------------
  // Future migrations go here
  

  return run;
}
function buildReleasePlan(selectedPacks = []) {
  const plan = [];

  const coreQueue = [...CORE_BUNDLES];
  const packQueues = (selectedPacks || [])
    .filter(packId => RESOURCE_PACKS[packId])
    .map(packId => ({
      packId,
      bundles: [...RESOURCE_PACKS[packId].bundles]
    }));

  while (coreQueue.length || packQueues.some(p => p.bundles.length)) {
    // 4 core bundles
    for (let i = 0; i < 4 && coreQueue.length; i++) {
      plan.push(coreQueue.shift().id);
    }

    // then 1 bundle from each selected pack (max 2)
    for (const pack of packQueues) {
      if (pack.bundles.length) {
        plan.push(pack.bundles.shift().id);
      }
    }
  }

  return plan;
}
const REASON_OPTIONS = [
  { type: "travel",   hasDetail: true  },
  { type: "person",   hasDetail: true  },
  { type: "career",   hasDetail: true  },
  { type: "heritage", hasDetail: true  },
  { type: "culture",  hasDetail: true  },
  { type: "fun",      hasDetail: false }
];

function reasonLabelKey(type) {
  return "reasonOption" + type.charAt(0).toUpperCase() + type.slice(1);
}
function reasonPromptKey(type) {
  return "reasonDetail" + type.charAt(0).toUpperCase() + type.slice(1);
}
function reasonPlaceholderKey(type) {
  return "reasonDetailPlaceholder" + type.charAt(0).toUpperCase() + type.slice(1);
}

function localizedTargetLabel(code) {
  const supportLang = languageState.support || "en";
  const hub = LANG_FILE_CACHE[supportLang]?.hubNames || LANG_FILE_CACHE["en"]?.hubNames || {};
  if (hub[code]) return hub[code];
  const meta = AVAILABLE_LANGUAGES.find(l => l.code === code);
  return meta?.label || code;
}

function showReasonScreen() {
  const screen = document.getElementById("reason-screen");
  const titleEl = document.getElementById("reason-title");
  const subtitleEl = document.getElementById("reason-subtitle");
  const container = document.getElementById("reason-buttons");
  const detailWrap = document.getElementById("reason-detail-wrap");
  const detailLabel = document.getElementById("reason-detail-label");
  const detailInput = document.getElementById("reason-detail-input");
  const detailHint = document.getElementById("reason-detail-hint");
  const continueBtn = document.getElementById("reason-continue");

  const langLabel = localizedTargetLabel(languageState.target).toUpperCase();
  titleEl.textContent = (ui("reasonTitle") || "WHY {lang}?").replace("{lang}", langLabel);
  subtitleEl.textContent = ui("reasonSubtitle");
  continueBtn.textContent = ui("reasonContinue");
  detailHint.textContent = ui("reasonDetailHint");

  let selectedType = null;

  container.innerHTML = "";
  REASON_OPTIONS.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.type = "button";
    btn.dataset.reason = opt.type;
    btn.textContent = ui(reasonLabelKey(opt.type));
    btn.onclick = () => {
      selectedType = opt.type;
      container.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      if (opt.hasDetail) {
        detailLabel.textContent = ui(reasonPromptKey(opt.type));
        detailInput.placeholder = ui(reasonPlaceholderKey(opt.type));
        detailWrap.classList.remove("hidden");
      } else {
        detailInput.value = "";
        detailWrap.classList.add("hidden");
      }

      continueBtn.disabled = false;
    };
    container.appendChild(btn);
  });

  detailWrap.classList.add("hidden");
  detailInput.value = "";
  continueBtn.disabled = true;

  continueBtn.onclick = () => {
    if (!selectedType) return;
    const detail = (detailInput.value || "").trim().slice(0, 80);
    run.reason = {
      type: selectedType,
      detail,
      savedAt: Date.now()
    };
    screen.classList.remove("active");
    document.getElementById("pack-screen").classList.add("active");
    renderPackSelection();
  };

  screen.classList.add("active");
}

const DEFAULT_MILESTONES = [50, 100, 150, 200, 250];

function milestoneTargetsFor(run) {
  const packs = run?.selectedResourcePacks || [];
  const targets = [...DEFAULT_MILESTONES];
  if (packs.length >= 2) targets.push(300);
  return targets;
}

function countKnownWords(run) {
  if (!run?.progress) return 0;
  let n = 0;
  for (const cid of Object.keys(run.progress)) {
    if (run.progress[cid]?.completed) n++;
  }
  return n;
}

function pendingMilestones(run) {
  const shown = new Set(run.milestonesShown || []);
  const current = countKnownWords(run);
  return milestoneTargetsFor(run)
    .filter(t => current >= t && !shown.has(t))
    .sort((a, b) => a - b);
}

function markMilestonesShown(run, crossed) {
  const set = new Set(run.milestonesShown || []);
  for (const n of crossed) set.add(n);
  run.milestonesShown = [...set].sort((a, b) => a - b);
}

function milestoneReasonLine(n, reason) {
  if (!reason || !reason.type) return ui("milestoneGeneric");
  const detail = (reason.detail || "").trim();
  if (reason.type === "fun") return ui("milestoneReasonFun");
  if (!detail) return ui("milestoneGeneric");
  const key = "milestoneReason" + reason.type.charAt(0).toUpperCase() + reason.type.slice(1);
  const tmpl = ui(key);
  if (!tmpl || tmpl === key) return ui("milestoneGeneric");
  return tmpl.replace("{detail}", detail).replace("{n}", String(n));
}

const TRACK_LABEL_OVERRIDES = {
  core: "CORE",
  pokemon: "POKÉMON"
};

function prettyTrackName(bundleId) {
  const m = bundleId.match(/^(.+)_(\d+)$/);
  if (!m) return { track: bundleId.toUpperCase(), num: "" };
  const [, trackKey, num] = m;
  const track = TRACK_LABEL_OVERRIDES[trackKey] ||
    trackKey.replace(/_/g, " ").toUpperCase();
  return { track, num };
}

function conceptPreviewText(concepts, supportLang) {
  if (!concepts || !concepts.length) return "";
  return concepts.slice(0, 5).map(cid => formOf(supportLang, cid)).join(" · ");
}

function getRoadmapStops(run) {
  const plan = (run.releasePlan && run.releasePlan.length)
    ? run.releasePlan
    : buildReleasePlan(run.selectedResourcePacks || []);
  const releasedIds = run.releasedBundleIds || [];
  const releasedSet = new Set(releasedIds);
  // The "current" stop is the most recently released bundle that isn't yet
  // fully complete. Older released bundles with unfinished concepts become
  // "in-progress" so the learner can see there's still work there without
  // everything pulsing at once.
  const latestReleased = releasedIds[releasedIds.length - 1];
  return plan.map((bundleId, index) => {
    const bundle = BUNDLE_INDEX[bundleId];
    const concepts = bundle?.concepts || [];
    const released = releasedSet.has(bundleId);
    const done = released && concepts.length > 0 &&
      concepts.every(cid => run.progress?.[cid]?.completed);
    let state;
    if (!released) state = "locked";
    else if (done) state = "done";
    else if (bundleId === latestReleased) state = "current";
    else state = "in-progress";
    return { bundleId, index, state, concepts };
  });
}

// opts: { onContinue, backTo?, sessionNumber?, showCoaching?, milestone? }
function showRoadmap(opts) {
  const screen = document.getElementById("roadmap-screen");
  const titleEl = document.getElementById("roadmap-title");
  const counterEl = document.getElementById("roadmap-counter");
  const messageEl = document.getElementById("roadmap-message");
  const pathEl = document.getElementById("roadmap-path");
  const coachingEl = document.getElementById("roadmap-coaching");
  const continueBtn = document.getElementById("roadmap-continue");
  const backBtn = document.getElementById("roadmap-back");
  const milestoneEl = document.getElementById("roadmap-milestone");

  const supportLang = languageState.support || "en";
  const stops = getRoadmapStops(run);
  const doneCount = stops.filter(s => s.state === "done").length;
  const unlockedCount = stops.filter(s => s.state !== "locked").length;
  const total = stops.length;

  titleEl.textContent = ui("roadmapTitle");
  counterEl.textContent = (ui("roadmapCounter") || "{done} of {total} stops unlocked")
    .replace("{done}", unlockedCount).replace("{total}", total);

  if (opts && opts.milestone) {
    const n = opts.milestone;
    const headline = (ui("milestoneHeadline") || "{n} WORDS").replace("{n}", String(n));
    const line = milestoneReasonLine(n, run.reason);
    milestoneEl.innerHTML = "";
    const h = document.createElement("div");
    h.className = "roadmap-milestone-headline";
    h.textContent = headline;
    const p = document.createElement("div");
    p.className = "roadmap-milestone-line";
    p.textContent = line;
    milestoneEl.appendChild(h);
    milestoneEl.appendChild(p);
    milestoneEl.classList.remove("hidden");
  } else if (milestoneEl) {
    milestoneEl.innerHTML = "";
    milestoneEl.classList.add("hidden");
  }

  if (opts && opts.sessionNumber) {
    messageEl.textContent = (ui("roadmapSessionFinished") || "Session {n} complete.")
      .replace("{n}", opts.sessionNumber);
    messageEl.classList.remove("hidden");
  } else {
    messageEl.textContent = "";
    messageEl.classList.add("hidden");
  }

  // Windowed path: show 1 completed stop before the focus, the focus
  // stop itself, and 2 upcoming — rather than the full 40-60 list.
  // Hidden stops are represented by tiny "↑ N behind / ↓ N ahead" chips.
  let focusIdx = stops.findIndex(s => s.state === "current");
  if (focusIdx < 0) focusIdx = stops.findIndex(s => s.state === "in-progress");
  if (focusIdx < 0) focusIdx = Math.max(0, doneCount); // first unreleased
  const WINDOW_BEFORE = 1;
  const WINDOW_AFTER = 2;
  const start = Math.max(0, focusIdx - WINDOW_BEFORE);
  const end = Math.min(stops.length, focusIdx + WINDOW_AFTER + 1);
  const hiddenBefore = start;
  const hiddenAfter = stops.length - end;
  const windowed = stops.slice(start, end);

  pathEl.innerHTML = "";

  if (hiddenBefore > 0) {
    const li = document.createElement("li");
    li.className = "roadmap-hidden-indicator behind";
    li.textContent = "↑ " + (ui("roadmapBehindLabel") || "{n} behind").replace("{n}", hiddenBefore);
    pathEl.appendChild(li);
  }

  windowed.forEach(stop => {
    const li = document.createElement("li");
    li.className = "roadmap-stop " + stop.state;
    li.dataset.bundleId = stop.bundleId;

    const dot = document.createElement("span");
    dot.className = "roadmap-stop-dot";
    dot.textContent = stop.state === "done" ? "✓" : String(stop.index + 1);
    li.appendChild(dot);

    const body = document.createElement("div");
    body.className = "roadmap-stop-body";

    const meta = document.createElement("div");
    meta.className = "roadmap-stop-meta";
    const { track, num } = prettyTrackName(stop.bundleId);
    meta.textContent = num ? `${track} · ${num}` : track;
    body.appendChild(meta);

    if (stop.state !== "locked") {
      const preview = document.createElement("div");
      preview.className = "roadmap-stop-preview";
      preview.textContent = conceptPreviewText(stop.concepts, supportLang);
      body.appendChild(preview);
    }

    li.appendChild(body);
    pathEl.appendChild(li);
  });

  if (hiddenAfter > 0) {
    const li = document.createElement("li");
    li.className = "roadmap-hidden-indicator ahead";
    li.textContent = "↓ " + (ui("roadmapAheadLabel") || "{n} ahead").replace("{n}", hiddenAfter);
    pathEl.appendChild(li);
  }

  if (opts && opts.showCoaching) {
    coachingEl.innerHTML = `Want to go faster? <a href="${EXTERNAL_LINKS.offer}" target="_blank" rel="noopener">Book a coaching session with Nekh</a>`;
    coachingEl.classList.remove("hidden");
  } else {
    coachingEl.classList.add("hidden");
  }

  continueBtn.textContent = ui(opts?.continueKey || "continue");
  continueBtn.onclick = () => {
    if (opts && typeof opts.onContinue === "function") opts.onContinue();
  };

  if (opts && opts.backTo) {
    backBtn.classList.remove("hidden");
    backBtn.onclick = opts.backTo;
  } else {
    backBtn.classList.add("hidden");
  }

  // Hide every other screen so only roadmap is active.
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
}

function renderPackSelection() {

  document.getElementById("pack-title").textContent = ui("resourcePacks");
  document.getElementById("pack-subtitle").textContent = ui("choosePacks");
  document.getElementById("start-run").textContent = ui("start");

  const container = document.getElementById("pack-buttons");
  container.innerHTML = "";

  Object.keys(RESOURCE_PACKS).forEach(packId => {

    const btn = document.createElement("button");
    btn.className = "primary";
    const packLabel = packId.replace("_", " ").toUpperCase();
    const betaBadge = RESOURCE_PACKS[packId].beta ? ' <span class="beta-badge">BETA</span>' : '';
    btn.innerHTML = packLabel + betaBadge;

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
function getAllConceptsForRun(run) {
  const concepts = new Set();

  // Core bundles
  CORE_BUNDLES.forEach(bundle => {
    bundle.concepts.forEach(c => concepts.add(c));
  });

  // Resource packs
  (run.selectedResourcePacks || []).forEach(packId => {
    const pack = RESOURCE_PACKS[packId];
    if (!pack) return;

    pack.bundles.forEach(bundle => {
      bundle.concepts.forEach(c => concepts.add(c));
    });
  });

  return Array.from(concepts);
}
function calculateWeightedProgress(run) {

  if (!run) return 0;

  const allConcepts = getAllConceptsForRun(run);
  if (!allConcepts.length) return 0;

  let totalValue = 0;

  allConcepts.forEach(cid => {

    // Not released → 0
    if (!run.released.includes(cid)) return;

    const st = run.progress?.[cid];

    // If no progress yet → treat as level 1
    if (!st) {
      totalValue += 1;
      return;
    }

    if (st.completed) {
      totalValue += 8;
      return;
    }

    totalValue += st.level || 1;
  });

  const maxValue = allConcepts.length * 8;

  return Math.round((totalValue / maxValue) * 100);
}
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

// TTS helper: inline speaker button for innerHTML templates
function ttsHtml(text, lang) {
  const e = String(text).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  return `<button class="tts-inline" data-tts="${e}" data-lang="${lang}" type="button">🔊</button>`;
}

// Walks back from the speaker button to find the visible text node it belongs
// to (e.g. "<p>O gato pula. <button>🔊</button></p>"), and replaces that text
// with a <span class="tts-phrase"> containing per-word <span class="tts-word">.
// Returns the phrase span (or null if no adjacent text was found).
function wrapAdjacentTextForHighlight(btn) {
  let node = btn.previousSibling;
  // Skip whitespace-only text nodes between the text and the button
  while (node && node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
    node = node.previousSibling;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const raw = node.textContent.replace(/\s+$/, "");
  if (!raw) return null;

  const phraseSpan = document.createElement("span");
  phraseSpan.className = "tts-phrase";

  const parts = raw.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      phraseSpan.appendChild(document.createTextNode(part));
    } else {
      const w = document.createElement("span");
      w.className = "tts-word";
      w.textContent = part;
      phraseSpan.appendChild(w);
    }
  }

  // Preserve any trailing whitespace between the phrase and the button.
  const trailing = node.textContent.match(/\s+$/);
  node.parentNode.insertBefore(phraseSpan, node);
  node.parentNode.removeChild(node);
  if (trailing) {
    phraseSpan.parentNode.insertBefore(document.createTextNode(trailing[0]), btn);
  }
  return phraseSpan;
}

// TTS helper: create a DOM speaker button for dynamic elements
function createTtsBtn(text, lang) {
  const btn = document.createElement("button");
  btn.className = "tts-inline";
  btn.textContent = "🔊";
  btn.type = "button";
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!btn._phrase) btn._phrase = wrapAdjacentTextForHighlight(btn);
    if (btn._phrase) speakWithHighlight(text, lang, btn._phrase);
    else speakAlways(text, lang);
  };
  // Prefetch on render so the audio is warm by the time the user clicks.
  prefetchTTS(text, lang);
  return btn;
}

// Wire up all data-tts buttons created via ttsHtml() and prefetch their audio.
function wireTts() {
  content.querySelectorAll('.tts-inline[data-tts]').forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn._phrase = wrapAdjacentTextForHighlight(btn);
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = btn.dataset.tts;
      const lang = btn.dataset.lang;
      if (btn._phrase) speakWithHighlight(text, lang, btn._phrase);
      else speakAlways(text, lang);
    };
    prefetchTTS(btn.dataset.tts, btn.dataset.lang);
  });
}




// Build dropdown — sorted by language code (abbreviation), filterable via the search input
const supportOptionsContainer = document.getElementById("support-options");
const supportSearchInput = document.getElementById("support-search");
let supportSearchQuery = "";

function renderSupportOptions() {
  supportOptionsContainer.innerHTML = "";

  const query = supportSearchQuery.trim().toLowerCase();
  const entries = Object.entries(SUPPORT_LANGUAGES)
    .map(([code, data]) => ({ code, data }))
    .filter(({ data }) => {
      if (!query) return true;
      return (
        data.label.toLowerCase().includes(query) ||
        data.short.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "support-option support-option-empty";
    empty.textContent = "No matches";
    supportOptionsContainer.appendChild(empty);
    return;
  }

  entries.forEach(({ code, data }) => {
    const option = document.createElement("div");
    option.className = "support-option";
    option.innerHTML = `
      <span class="support-short">${data.short}</span>
      <span>${data.label}</span>
    `;
    option.onclick = async () => {
      languageState.support = code;
      USER.supportLanguage = code;
      saveUser();
      await getLangFileData(code);
      updateSupportUI(code);
      updateUIStrings(code);
      renderLanguageButtons();
      supportDropdown.classList.add("hidden");
    };
    supportOptionsContainer.appendChild(option);
  });
}

renderSupportOptions();

supportSearchInput.addEventListener("input", (e) => {
  supportSearchQuery = e.target.value;
  renderSupportOptions();
});

// Toggle dropdown
supportPill.addEventListener("click", () => {
  const wasHidden = supportDropdown.classList.contains("hidden");
  supportDropdown.classList.toggle("hidden");
  if (wasHidden) {
    supportSearchInput.value = "";
    supportSearchQuery = "";
    renderSupportOptions();
    supportSearchInput.focus();
  }
});

function updateSupportUI(code) {
  const data = SUPPORT_LANGUAGES[code];
  supportShort.textContent = data.short;
  supportLabel.textContent = data.label;
}
  window.GLOBAL_VOCAB = { concepts: {}, languages: {} };
  const languageSearchInput = document.getElementById("language-search");
  if (languageSearchInput) {
    languageSearchInput.addEventListener("input", (e) => {
      languageSearchQuery = e.target.value;
      renderLanguageButtons();
    });
  }
  function renderLanguageButtons() {

  languageButtonsContainer.innerHTML = "";

  const support = languageState.support || "en";
  const names = LANG_FILE_CACHE[support]?.hubNames || LANG_FILE_CACHE["en"]?.hubNames || {};

  // Build list with progress and display name, excluding the active support language
  const query = languageSearchQuery.trim().toLowerCase();
  const entries = AVAILABLE_LANGUAGES
    .filter(lang => lang.code !== support)
    .map(lang => {
      const runForLang = USER.runs[lang.code];
      const progress = runForLang ? calculateWeightedProgress(runForLang) : 0;
      const name = names[lang.code] || lang.label;
      return { lang, progress, name };
    })
    .filter(({ lang, name }) => {
      if (!query) return true;
      return (
        name.toLowerCase().includes(query) ||
        lang.label.toLowerCase().includes(query) ||
        lang.nativeLabel.toLowerCase().includes(query) ||
        lang.short.toLowerCase().includes(query) ||
        lang.code.toLowerCase().includes(query)
      );
    });

  // Sort: highest progress first, then alphabetical by name.
  entries.sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name));

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "language-empty";
    empty.textContent = "No languages match your search.";
    languageButtonsContainer.appendChild(empty);
    return;
  }

  entries.forEach(({ lang, progress, name }) => {
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.innerHTML = `
      <div>${name}${lang.beta ? ' <span class="beta-badge">BETA</span>' : ''}</div>
      <div style="font-size:12px;opacity:0.7;margin-top:4px;">${progress}%</div>
    `;
    btn.onclick = () => enterLanguage(lang.code);
    languageButtonsContainer.appendChild(btn);
  });
}
  async function loadAndMergeVocab() {
    window.GLOBAL_VOCAB = { concepts: {}, languages: {} };

    const targetLang = languageState.target;

    // Fetch all vocab files in parallel
    const vocabResults = await Promise.all(
      VOCAB_FILES.map(file => fetch(file).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${file} (${r.status})`);
        return r.json();
      }))
    );

    for (let i = 0; i < vocabResults.length; i++) {
      const data = vocabResults[i];
      const source = VOCAB_FILES[i];
      for (const concept of data.concepts || []) {
        // Tag each concept with the file it came from. We use this to keep
        // random modifier injection grounded — pack-specific adjectives
        // (SHINY, WILD, LEGENDARY from pokemon.json) only get injected onto
        // nouns from the same pack, while core adjectives remain broadly
        // compatible. Without this, we get "I read a shiny book" type
        // mismatches.
        window.GLOBAL_VOCAB.concepts[concept.concept_id] = { ...concept, source };
      }
      // Resource pack files (pokemon.json etc.) still carry their own
      // language sections — merge those as before.
      for (const [langCode, langData] of Object.entries(data.languages || {})) {
        if (!window.GLOBAL_VOCAB.languages[langCode]) {
          window.GLOBAL_VOCAB.languages[langCode] = { forms: {} };
        }
        Object.assign(window.GLOBAL_VOCAB.languages[langCode].forms, langData.forms || {});
      }
    }

    // Load target + support lang files in parallel
    // getLangFileData() caches, so repeat calls are free
    const langCodes = [...new Set([targetLang, languageState.support].filter(Boolean))];
    const langResults = await Promise.all(langCodes.map(getLangFileData));

    for (let i = 0; i < langCodes.length; i++) {
      const code = langCodes[i];
      const langData = langResults[i];
      if (!window.GLOBAL_VOCAB.languages[code]) {
        window.GLOBAL_VOCAB.languages[code] = { forms: {} };
      }
      Object.assign(window.GLOBAL_VOCAB.languages[code].forms, langData.forms || {});
    }
  }

  let TEMPLATE_CACHE = null;

async function loadTemplates(selectedPacks = []) {
  const files = ["sentence_templates.json"];

  (selectedPacks || []).forEach(packId => {
    const pack = RESOURCE_PACKS[packId];
    if (pack?.templateFile) {
      files.push(pack.templateFile);
    }
  });

  // Fetch all template files in parallel
  const results = await Promise.all(files.map(file => fetch(file).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${file} (${r.status})`);
    return r.json();
  })));
  TEMPLATE_CACHE = results.flatMap(data => data.templates || []);

  return TEMPLATE_CACHE;
}

  let run = null;
function updateUIStrings(lang) {

  const data = LANG_FILE_CACHE[lang] || LANG_FILE_CACHE["en"] || {};
  const strings = data.uiStrings || {};

  document.getElementById("open-app").textContent = strings.openApp;
  const blueprintLink = document.getElementById("link-blueprint");
const skoolLink = document.getElementById("link-skool");
const offerLink = document.getElementById("link-offer");

if (blueprintLink) {
  blueprintLink.textContent = strings.blueprint;
  blueprintLink.href = EXTERNAL_LINKS.blueprint;
}

if (skoolLink) {
  skoolLink.textContent = strings.skool;
  skoolLink.href = EXTERNAL_LINKS.skool;
}

if (offerLink) {
  offerLink.textContent = strings.offer;
  offerLink.href = EXTERNAL_LINKS.offer;
}

  const languageTitle = document.querySelector("#language-screen .title");
  const languageSubtitle = document.querySelector("#language-screen .subtitle");

  languageTitle.textContent = strings.languagesTitle;
  languageSubtitle.textContent = strings.chooseLanguage;

  document.getElementById("hub-quit").textContent = strings.quitLearning;
  document.getElementById("quit-learning").textContent = strings.quitLearning;

  const journeyBtnEl = document.getElementById("journey-btn");
  if (journeyBtnEl && strings.journeyBtn) {
    journeyBtnEl.textContent = strings.journeyBtn;
  }
  const roadmapBackEl = document.getElementById("roadmap-back");
  if (roadmapBackEl && strings.roadmapBack) {
    roadmapBackEl.textContent = strings.roadmapBack;
  }
  const buyAccess = document.getElementById("link-buy-access");

if (buyAccess) {
  buyAccess.href = EXTERNAL_LINKS.offer;
  buyAccess.textContent = strings.buyAccess;
}

  const sessionTitle = document.querySelector("#learning-screen .title");
  sessionTitle.textContent = strings.sessionTitle;
  const langMeta = AVAILABLE_LANGUAGES.find(l => l.code === lang);
  document.documentElement.dir = langMeta?.isRTL ? "rtl" : "ltr";
const startSubtitle = document.getElementById("start-subtitle");
if (startSubtitle) {
  startSubtitle.innerHTML = `${strings.startSubtitle}<span class="version-tag">${APP_VERSION}</span>`;
}

  const feedbackBtnEl       = document.getElementById("feedback-btn");
  const feedbackCloseEl     = document.getElementById("feedback-close");
  const feedbackTitleEl     = document.getElementById("feedback-modal-title");
  const feedbackSubtitleEl  = document.getElementById("feedback-modal-subtitle");
  const feedbackTextEl      = document.getElementById("feedback-text");
  const feedbackSubmitEl    = document.getElementById("feedback-submit");

  if (feedbackBtnEl && strings.feedbackOpen) {
    feedbackBtnEl.setAttribute("aria-label", strings.feedbackOpen);
  }
  if (feedbackCloseEl && strings.feedbackClose) {
    feedbackCloseEl.setAttribute("aria-label", strings.feedbackClose);
  }
  if (feedbackTitleEl && strings.feedbackTitle) {
    feedbackTitleEl.textContent = strings.feedbackTitle;
  }
  if (feedbackSubtitleEl && strings.feedbackSubtitle) {
    feedbackSubtitleEl.textContent = strings.feedbackSubtitle;
  }
  if (feedbackTextEl && strings.feedbackPlaceholder) {
    feedbackTextEl.setAttribute("placeholder", strings.feedbackPlaceholder);
  }
  if (feedbackSubmitEl && strings.feedbackSubmit) {
    feedbackSubmitEl.textContent = strings.feedbackSubmit;
  }
}
function ui(key) {
  const lang = languageState.support || "en";
  const primary = LANG_FILE_CACHE[lang]?.uiStrings;
  if (primary && primary[key] !== undefined) return primary[key];
  const fallback = LANG_FILE_CACHE["en"]?.uiStrings;
  if (fallback && fallback[key] !== undefined) return fallback[key];
  return key;
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
  return true;
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
function canConceptBeTested(cid) {

  const s = ensureProgress(cid);

  if (s.completed) return false;
  const level = s.level;

// 🔥 LEVEL 2: no template dependency anymore
if (level === 2) {
  return true;
}

  const attempts = run.sessionAttempts?.[cid] || 0;
  const levelUps = run.sessionLevelUps?.[cid] || 0;

  // ❌ fatigue rule
  if (attempts >= 8 || levelUps >= 3) return false;

  // ❌ spacing rule
  if (!passesSpacingRule(cid)) return false;

  const meta = window.GLOBAL_VOCAB.concepts[cid];

  // modifiers always allowed
  if (meta?.type === "adjective" || meta?.type === "number") {
    return true;
  }

  // ❌ must have at least one valid template
  return TEMPLATE_CACHE.some(tpl => {

  if (!tpl.concepts.includes(cid)) return false;
  if (!templateEligible(tpl)) return false;

  const meta = window.GLOBAL_VOCAB.concepts[cid];

  const role =
    meta?.type === "pronoun" ? "pronoun" :
    meta?.type === "verb" ? "verb" :
    "object";

  const q = tpl.questions?.[role];
  if (!q) return false;

  const releasedOptions = q.choices.filter(opt =>
  run.released.includes(opt)
);

if (releasedOptions.length < 4) return false;

// 🔥 NEW: ensure it can actually render
if (meta?.type === "adjective" || meta?.type === "number") {
  return true;
}

const options = buildRecognitionOptions(tpl, cid, 4);

if (!options || options.length < 4) return false;

return true;
});
}
function canConceptBeIntroduced(cid) {

  return TEMPLATE_CACHE.some(tpl => {

    if (!tpl.concepts.includes(cid)) return false;

    // ALL concepts must already be released
    return tpl.concepts.every(c =>
      run.released.includes(c)
    );
  });
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
releaseNextBundle(run);

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
  run.sessionExerciseCount = (run.sessionExerciseCount || 0) + 1;

  if (!correct) {
    state.streak = 0;
    state.cooldown = 2;
  } else {
    state.streak++;
    // Speed-aware cooldown: fast recall pushes the next review out,
    // slow recall pulls it in for reinforcement.
    state.cooldown = cooldownForElapsed(exerciseElapsedMs());

    let leveledUp = false;

    const needed = state.level === 1 ? 1 : 2;

if (state.streak >= needed) {
      const levelCap = RECOGNITION_CONCEPTS.has(cid)
        ? 4
        : isModifierConcept(cid) ? 5 : MAX_LEVEL;
      const levelUps = run.sessionLevelUps[cid] || 0;

if (levelUps >= 3) {
  state.streak = 0;
  return;
}

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
// Returns "a" or "an" based on the first letter of the following word.
// Covers the standard vowel-sound rule (a, e, i, o, u).
// entry.article can still override for genuine exceptions (e.g. "an hour", "a unicorn").
function englishIndefiniteArticle(nextWord) {
  if (!nextWord) return "a";
  const first = nextWord.trim()[0]?.toLowerCase();
  return (first === "a" || first === "e" || first === "i" || first === "o" || first === "u")
    ? "an"
    : "a";
}

const PLURAL_EXCEPTIONS = {
  child: "children",
  mouse: "mice",
  person: "people",
  man: "men",
  woman: "women",
  tooth: "teeth",
  foot: "feet",
  goose: "geese",
  ox: "oxen",
};

function pluralize(word) {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (PLURAL_EXCEPTIONS[lower]) {
    // preserve original capitalisation
    return word[0] === word[0].toUpperCase()
      ? PLURAL_EXCEPTIONS[lower][0].toUpperCase() + PLURAL_EXCEPTIONS[lower].slice(1)
      : PLURAL_EXCEPTIONS[lower];
  }
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(word)) return word + "es";
  return word + "s";
}

// Returns the plural form for non-English languages.
// Reads entry.plural if present; falls back to the singular formOf().
// Respects entry.invariantPlural for words that don't change (e.g. Pokémon).
function pluralFormOf(lang, cid) {
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid];
  if (!entry) return formOf(lang, cid);
  if (typeof entry === "object" && !Array.isArray(entry)) {
    if (entry.invariantPlural) return formOf(lang, cid);
    if (entry.plural) return entry.plural;
  }
  return formOf(lang, cid);
}

function nounPhrase(lang, cid) {

  const meta = window.GLOBAL_VOCAB.concepts[cid];
  const entry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[cid] || {};

  const base = entry.form || formOf(lang, cid);

  // Apply article logic when the concept is marked countable OR when the
  // form itself carries article/gender data (covers resource-pack nouns that
  // define articles without a countable flag on the concept).
  const hasArticleInfo = meta?.countable || entry.article || entry.gender;
  if (!hasArticleInfo) return base;

  if (lang === "en") {
    const article = entry.article || englishIndefiniteArticle(base);
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

  if (lang === "de") {
    if (!entry.gender) return base; // mass nouns / uncountable — no article
    if (entry.gender === "f") return "eine " + base;
    return "ein " + base; // m and n both use "ein"
  }

  if (lang === "el") {
    if (!entry.gender) return base; // mass nouns / uncountable — no article
    if (entry.gender === "m") return "ένας " + base;
    if (entry.gender === "f") return "μία " + base;
    return "ένα " + base; // neuter
  }

  return base;
}
function surfaceForm(lang, cid) {
  const meta = window.GLOBAL_VOCAB.concepts[cid];

  if (!meta) return cid;

  if (meta.type === "noun") {
    return nounPhrase(lang, cid);
  }

  return formOf(lang, cid); // ✅ THIS is the correct fallback
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
  ko: "SOV",
  uk: "SVO",
  de: "SVO",
  el: "SVO",
  tr: "SOV"
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
    const str = String(sentence || "");
    const target = String(surface || "").toLowerCase().trim();

    // If we don't know what to blank, don't pretend we did.
    if (!target) return str;

    // Use substring matching so multi-word surface forms (e.g. "gym leader",
    // "лідер залу") are found and blanked correctly.
    const idx = str.toLowerCase().indexOf(target);
    if (idx === -1) return str;

    return str.slice(0, idx) + "_____" + str.slice(idx + target.length);
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

// Source files that ship "broad" vocabulary — concepts from these files
// combine naturally with any noun. Pack-specific adjectives (e.g. SHINY
// from pokemon.json, or specialty terms from cooking/anime/etc.) are
// tied to their own pack context via the source match check below.
const BROAD_SOURCE_FILES = new Set([
  "adjectives.json","connectors.json","directions_positions.json",
  "glue_words.json","nouns.json","numbers.json",
  "politeness_modality.json","pronouns.json","quantifiers.json",
  "question_words.json","time_words.json","verbs.json"
]);

// Decides whether a modifier (adjective/number/etc.) should pair with a
// given noun. Two rules:
//   1. Mass/uncountable nouns reject modifiers entirely — avoids "big water"
//      / "two food" / "a shiny food" awkwardness.
//   2. Pack-specific modifiers only pair with nouns from the same pack
//      source; broad modifiers pair with anything.
function isModifierCompatible(lang, modifierCid, nounCid) {
  const nounMeta  = window.GLOBAL_VOCAB.concepts[nounCid];
  const nounEntry = window.GLOBAL_VOCAB.languages?.[lang]?.forms?.[nounCid] || {};
  const canTakeModifier = nounMeta?.countable || nounEntry.article || nounEntry.gender;
  if (!canTakeModifier) return false;

  const modMeta = window.GLOBAL_VOCAB.concepts[modifierCid];
  if (!modMeta) return true;
  if (BROAD_SOURCE_FILES.has(modMeta.source)) return true;
  return modMeta.source === nounMeta?.source;
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
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function joinSentence(words, punctuation = ".") {
  return capitalizeFirst(words.filter(Boolean).join(" ")) + punctuation;
}
function possessiveWord(lang, cid) {
  return surfaceForm(lang, cid);
}

function nounWithPossessive(lang, possessiveCid, nounCid) {
  return `${possessiveWord(lang, possessiveCid)} ${formOf(lang, nounCid)}`;
}

// Languages where adjective follows the noun (e.g. "casa grande")
const POST_ADJECTIVE_LANGS = new Set(["pt", "ar"]);
// All others (en, ja, ko, no, uk, de, el, tr) place adjective before noun

function adjectiveNounPhrase(lang, adjectiveCid, nounCid) {
  const adjective = formOf(lang, adjectiveCid);
  const bare = formOf(lang, nounCid);
  const withArticle = nounPhrase(lang, nounCid);

  if (POST_ADJECTIVE_LANGS.has(lang)) {
    return `${withArticle} ${adjective}`;
  }
  // Insert adjective between article and noun
  if (withArticle !== bare) {
    let article = withArticle.substring(0, withArticle.length - bare.length).trimEnd();
    // For English, the article must agree with the adjective (now the next word),
    // not the noun — "an old spell" not "a old spell".
    if (lang === "en" && /^an?$/i.test(article)) {
      article = englishIndefiniteArticle(adjective);
    }
    return `${article} ${adjective} ${bare}`;
  }
  return `${adjective} ${bare}`;
}
function buildCopularDemonstrative(lang, subjectCid, beCid, adjectiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const be = getVerbForm(beCid, subjectCid, lang);
  const complement = adjectiveNounPhrase(lang, adjectiveCid, nounCid);
  return joinSentence([subject, be, complement]);
}

function buildYesNoQuestionCopular(lang, subjectCid, beCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const be = getVerbForm(beCid, subjectCid, lang);
  const complement = nounWithPossessive(lang, possessiveCid, nounCid);

  if (lang === "en") {
    return capitalizeFirst(`${be} ${subject} ${complement}?`);
  }

  return capitalizeFirst(`${be} ${subject} ${complement}?`);
}
function buildSubjectBeNounClause(lang, subjectCid, beCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const be = getVerbForm(beCid, subjectCid, lang);
  const noun = nounPhrase(lang, nounCid);
  return `${subject} ${be} ${noun}`;
}

function buildSubjectVerbObjectWithPossessiveClause(lang, subjectCid, verbCid, objectCid, withCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const verb = getVerbForm(verbCid, subjectCid, lang);
  const object = formOf(lang, objectCid);
  const withWord = formOf(lang, withCid);
  const companion = nounWithPossessive(lang, possessiveCid, nounCid);

  return `${subject} ${verb} ${object} ${withWord} ${companion}`;
}

function buildSubjectVerbWithPossessiveClause(lang, subjectCid, verbCid, withCid, possessiveCid, nounCid) {
  const subject = formOf(lang, subjectCid);
  const verb = getVerbForm(verbCid, subjectCid, lang);
  const withWord = formOf(lang, withCid);
  const companion = nounWithPossessive(lang, possessiveCid, nounCid);

  return `${subject} ${verb} ${withWord} ${companion}`;
}
function buildComplexClauseSentence(lang, linkerCid, clauseA, clauseB, subordinateFirst = false) {
  const linker = formOf(lang, linkerCid);

  if (subordinateFirst) {
    return capitalizeFirst(`${linker} ${clauseA}, ${clauseB}.`);
  }

  return capitalizeFirst(`${clauseA} ${linker} ${clauseB}.`);
}
function buildSentence(lang, tpl, forcedConcept = null) {
if (tpl.structure?.type === "copular_demonstrative") {
  const s = tpl.slots;
  return buildCopularDemonstrative(
    lang,
    s.subject,
    s.verb,
    s.adjective,
    s.noun
  );
}
if (tpl.structure?.type === "yes_no_question_copular") {
  const s = tpl.slots;
  return buildYesNoQuestionCopular(
    lang,
    s.subject,
    s.verb,
    s.possessive,
    s.noun
  );
}
if (tpl.structure?.type === "complex_clause") {
  const s = tpl.slots;

  const subClause = buildSubjectBeNounClause(
    lang,
    s.sub_subject,
    s.sub_verb,
    s.sub_noun
  );

  let mainClause;

  if (s.main_object) {
    mainClause = buildSubjectVerbObjectWithPossessiveClause(
      lang,
      s.main_subject,
      s.main_verb,
      s.main_object,
      s.main_prep,
      s.main_possessive,
      s.main_noun
    );
  } else {
    mainClause = buildSubjectVerbWithPossessiveClause(
      lang,
      s.main_subject,
      s.main_verb,
      s.main_prep,
      s.main_possessive,
      s.main_noun
    );
  }

  return buildComplexClauseSentence(
    lang,
    tpl.structure.linker,
    subClause,
    mainClause,
    tpl.structure.subordinate_first
  );
}
  const ordered = orderedConceptsForTemplate(tpl, lang);
  if (!ordered || !ordered.length) return "";

  const forcedMeta = forcedConcept
    ? window.GLOBAL_VOCAB.concepts[forcedConcept]
    : null;

  const subjectCid = ordered.find(c =>
    window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
  );

  const words = ordered.map((cid, idx) => {
    const meta = window.GLOBAL_VOCAB.concepts[cid];
    if (!meta) return cid;

    if (meta.type === "verb") {
      return getVerbForm(cid, subjectCid, lang);
    }

    if (meta.type === "noun") {

  // If the template itself has a possessive directly before this noun, suppress the article.
  const precededByPossessive = idx > 0 &&
    window.GLOBAL_VOCAB.concepts[ordered[idx - 1]]?.semantic_role === "possessive";
  let phrase = precededByPossessive ? formOf(lang, cid) : nounPhrase(lang, cid);

  let adjectiveWord = null;
  let adjectiveCid = null;
  let numberWord = null;
  let numberCid = null;

  // adjective
  if (forcedMeta?.type === "adjective") {
    adjectiveCid = forcedConcept;
    adjectiveWord = formOf(lang, forcedConcept);
  } else {
    const adjectives = run.released.filter(c => {
      const m = window.GLOBAL_VOCAB.concepts[c];
      if (m?.type !== "adjective") return false;
      if (m?.semantic_role === "possessive") return false; // possessives must not be randomly injected as modifiers
      const st = ensureProgress(c);
      if (st.completed || st.level < 4) return false;
      // Only pair adjectives with nouns they make sense with — no
      // "shiny food" / "wild book" / "big water" style mismatches.
      return isModifierCompatible(lang, c, cid);
    });

    if (adjectives.length && Math.random() < 0.75) {
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      adjectiveCid = adj;
      adjectiveWord = formOf(lang, adj);
    }
  }

  // number
  if (forcedMeta?.type === "number") {
    numberCid = forcedConcept;
    numberWord = formOf(lang, forcedConcept);
  } else {
    // Random number injection for variety. Skips ONE (redundant with the
    // indefinite article) and restricts to numbers the learner has actually
    // started working on (L4+, not yet completed). Also skipped for mass
    // nouns ("two water" / "three food" don't work) via compatibility check.
    const numbers = run.released.filter(c => {
      if (c === "ONE") return false;
      const m = window.GLOBAL_VOCAB.concepts[c];
      if (m?.type !== "number") return false;
      const st = ensureProgress(c);
      if (st.completed || st.level < 4) return false;
      return isModifierCompatible(lang, c, cid);
    });
    if (numbers.length && Math.random() < 0.15) {
      const n = numbers[Math.floor(Math.random() * numbers.length)];
      numberCid = n;
      numberWord = formOf(lang, n);
    }
  }

  // apply modifiers
  const bare = formOf(lang, cid);
  const POST_ADJ = POST_ADJECTIVE_LANGS.has(lang);

  if (numberWord) {
    // Numbers replace the article: "two books" not "two a book"
    const isPlural = numberCid !== "ONE";
    let nounForm;
    if (!isPlural) {
      nounForm = bare;
    } else if (lang === "en") {
      const enEntry = window.GLOBAL_VOCAB.languages?.en?.forms?.[cid] || {};
      nounForm = enEntry.invariantPlural ? bare : pluralize(bare);
    } else {
      nounForm = pluralFormOf(lang, cid);
    }
    if (adjectiveWord) {
      const adjForm = (isPlural && adjectiveCid && lang !== "en")
        ? pluralFormOf(lang, adjectiveCid)
        : adjectiveWord;
      return POST_ADJ
        ? numberWord + " " + nounForm + " " + adjForm
        : numberWord + " " + adjForm + " " + nounForm;
    }
    return numberWord + " " + nounForm;
  }

  if (adjectiveWord) {
    const adjectiveIsPossessive =
      window.GLOBAL_VOCAB.concepts[adjectiveCid]?.semantic_role === "possessive";
    if (adjectiveIsPossessive) {
      // Possessives replace the article entirely: "her wizard" not "a her wizard"
      phrase = adjectiveWord + " " + bare;
    } else if (POST_ADJ) {
      // Article + noun + adjective: "uma casa grande"
      phrase = phrase + " " + adjectiveWord;
    } else if (phrase !== bare) {
      // Has article — insert adjective between: "a big house"
      let article = phrase.substring(0, phrase.length - bare.length).trimEnd();
      // For English, recompute article against the adjective (next word after article).
      if (lang === "en" && /^an?$/i.test(article)) {
        article = englishIndefiniteArticle(adjectiveWord);
      }
      phrase = article + " " + adjectiveWord + " " + bare;
    } else {
      // No article: "big water"
      phrase = adjectiveWord + " " + bare;
    }
  }

  return phrase;
}

    return surfaceForm(lang, cid);
  });

  if (lang === "ja") {
    const wordsWithParticles = [...words];

    const pronounIndex = ordered.findIndex(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
    );

    const nounIndex = ordered.findIndex(c =>
      window.GLOBAL_VOCAB.concepts[c]?.type === "noun"
    );

    // Insert in reverse index order so earlier splices don't shift later indices
    const insertions = [];
    if (pronounIndex !== -1) insertions.push({ idx: pronounIndex + 1, particle: "は" });
    if (nounIndex !== -1) insertions.push({ idx: nounIndex + 1, particle: "を" });
    insertions.sort((a, b) => b.idx - a.idx);
    for (const ins of insertions) {
      wordsWithParticles.splice(ins.idx, 0, ins.particle);
    }

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

  const headword = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  content.innerHTML = `
    <h2>${safe(headword(formOf(targetLang, targetConcept)))} ${ttsHtml(formOf(targetLang, targetConcept), targetLang)}</h2>
    <p>${safe(headword(formOf(supportLang, targetConcept)))}</p>
    <hr>
    <p>${safe(targetSentence)} ${ttsHtml(targetSentence, targetLang)}</p>
    <p>${safe(supportSentence)}</p>
    <button id="continue-btn">${ui("continue")}</button>
  `;
  wireTts();

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
      <p>${safe(sentence)} ${ttsHtml(sentence, targetLang)}</p>
      <p><strong>${ui("chooseTranslation")}</strong></p>
      <h2>${safe(formOf(targetLang, targetConcept))} ${ttsHtml(formOf(targetLang, targetConcept), targetLang)}</h2>
      <div id="choices"></div>
      <div style="margin-top:20px;text-align:center;">
        <button id="check-btn" disabled>${ui("check")}</button>
      </div>
    `;
    wireTts();

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

if (releasedOptions.length < 4) return null;

const options = shuffle([...releasedOptions]).slice(0, 4);
  const promptText = resolvePrompt(q, supportLang);
  const sentence = buildSentence(targetLang, tpl);

  content.innerHTML = `
    <p>${safe(sentence)} ${ttsHtml(sentence, targetLang)}</p>
    <p><strong>${safe(promptText)}</strong></p>
    <div id="choices"></div>
    <div style="margin-top:20px;text-align:center;">
      <button id="check-btn" disabled>${ui("check")}</button>
    </div>
  `;
  wireTts();

  const container = document.getElementById("choices");
  const checkBtn = document.getElementById("check-btn");

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = surfaceForm(supportLang, opt);

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
// Level 2 – Concept-based questions
// -------------------------
function buildLevel2Question(targetConcept, targetLang, supportLang) {

  const meta = window.GLOBAL_VOCAB.concepts[targetConcept];
  if (!meta) return null;

  const type = meta.type;

  // Prompt = target word (clean + language agnostic)
  const prompt = formOf(targetLang, targetConcept);

 const pool = run.released.filter(cid => {
  if (cid === targetConcept) return false;

  const m = window.GLOBAL_VOCAB.concepts[cid];
  if (!m) return false;

  return m.type === type;
});

// 🔥 REMOVE DUPLICATE MEANINGS
const usedSupport = new Set();
const filteredPool = [];

for (const cid of pool) {
  const s = surfaceForm(supportLang, cid);

  if (usedSupport.has(s)) continue;

  usedSupport.add(s);
  filteredPool.push(cid);
}

if (filteredPool.length < 3) return null;

const options = shuffle([
  targetConcept,
  ...shuffle(filteredPool).slice(0, 3)
]);

  return {
    prompt,
    options,
    answer: targetConcept
  };
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
    const text = formOf(targetLang, opt);
    const wrap = document.createElement("div");
    wrap.className = "word-bank-chip";

    const btn = document.createElement("button");
    btn.textContent = text;
    btn.onclick = () => {
      const correct = opt === targetConcept;
      btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
      decrementCooldowns();
      applyResult(targetConcept, correct);
      setTimeout(() => renderNext(targetLang, supportLang), 600);
    };
    wrap.appendChild(btn);
    wrap.appendChild(createTtsBtn(text, targetLang));

    container.appendChild(wrap);
  });

  return true; // 🔥 CRITICAL
}

  // --- Existing core path ---
  const supportSentence = safe(buildSentence(supportLang, tpl));

// ✅ Build actual sentence
const sentenceTarget = buildSentence(targetLang, tpl);

// ✅ Get correct surface form (CRITICAL)
const surface = safeSurfaceForConcept(tpl, targetLang, targetConcept);

if (!surface) return null;

// ✅ Blank based on REAL word, not position
const blanked = blankSentence(sentenceTarget, surface);

 const options = buildRecognitionOptions(tpl, targetConcept, 4);
 // 🔥 Remove duplicate meanings (same fix as Level 2)
const usedSupport = new Set();
const filteredOptions = [];

for (const cid of options) {
  const s = surfaceForm(supportLang, cid);
  if (usedSupport.has(s)) continue;

  usedSupport.add(s);
  filteredOptions.push(cid);
}

if (filteredOptions.length < 4) return null;

let finalOptions = filteredOptions.slice(0, 4);

// ensure correct answer always included
if (!finalOptions.includes(targetConcept)) {
  finalOptions[0] = targetConcept;
  finalOptions = shuffle(finalOptions);
}

if (!options || options.length < 4) {
  return null;
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
const subjectCid = tpl.concepts.find(c =>
  window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
);
  finalOptions.forEach(opt => {

  const meta = window.GLOBAL_VOCAB.concepts[opt];
  let text;

  if (meta?.type === "verb") {
    // ✅ Conjugate ALL verbs consistently
    text = getVerbForm(opt, subjectCid, targetLang);
  }
  else if (meta?.type === "noun") {
    text = nounPhrase(targetLang, opt);
  }
  else {
    text = tpl.surface?.[targetLang]?.[opt] || formOf(targetLang, opt);
  }

  text = isSentenceStart
    ? text.charAt(0).toUpperCase() + text.slice(1)
    : text.charAt(0).toLowerCase() + text.slice(1);

  const wrap = document.createElement("div");
  wrap.className = "word-bank-chip";

  const btn = document.createElement("button");
  btn.textContent = text;

    btn.onclick = () => {
      const correct = opt === targetConcept;
      btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
      decrementCooldowns();
      applyResult(targetConcept, correct);
      setTimeout(() => renderNext(targetLang, supportLang), 600);
    };

    wrap.appendChild(btn);
    wrap.appendChild(createTtsBtn(text, targetLang));
    container.appendChild(wrap);
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

if (!options || options.length < 4) {
  return null;
}

// 🔥 Ensure correct answer is always included BEFORE slicing
let pool = [...options];

if (!pool.includes(targetConcept)) {
  pool.unshift(targetConcept);
}

// 🔥 Now slice
let finalOptions = shuffle(pool).slice(0, 4);

// 🔥 Safety net (guarantee)
if (!finalOptions.includes(targetConcept)) {
  finalOptions[0] = targetConcept;
  finalOptions = shuffle(finalOptions);
}


    content.innerHTML = `
      <p>${ui("chooseTranslation")}</p>
      <h2>${promptSupport}</h2>
      <div id="choices"></div>
    `;

    const container = document.getElementById("choices");

    finalOptions.forEach(opt => {
      const text = resolveTargetSurface(opt);
      const wrap = document.createElement("div");
      wrap.className = "word-bank-chip";

      const btn = document.createElement("button");
      btn.textContent = text;
      btn.onclick = () => {
        const correct = opt === targetConcept;
        btn.style.backgroundColor = correct ? "#4CAF50" : "#D32F2F";
        decrementCooldowns();
        applyResult(targetConcept, correct);
        setTimeout(() => renderNext(targetLang, supportLang), 600);
      };
      wrap.appendChild(btn);
      wrap.appendChild(createTtsBtn(text, targetLang));

      container.appendChild(wrap);
    });
  }
// -------------------------
// Level 5 – Matching (Wire Style)
// -------------------------
function renderMatchingL5(targetLang, supportLang) {

  subtitle.textContent = "Level 5";

  // Gather eligible concepts, dedup by target-language form
  const allEligible = run.released.filter(cid => {
    const st = ensureProgress(cid);
    return st.level === 5 && !st.completed && passesSpacingRule(cid);
  });
  const seenForms = new Set();
  const eligible = allEligible.filter(cid => {
    const form = resolveTargetSurface(cid);
    if (seenForms.has(form)) return false;
    seenForms.add(form);
    return true;
  });

  // Pick exactly 5 (caller guarantees >= 5 unique-form concepts)
  const shuffled = shuffle([...eligible]);
  const selected = shuffled.slice(0, 5);

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
    ? surfaceForm(supportLang, cid)
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
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:2px;";
    wrap.appendChild(createTtsBtn(resolveTargetSurface(cid), targetLang));
    wrap.appendChild(createButton(cid, "right"));
    rightColumn.appendChild(wrap);
  });

  document.getElementById("check-matches").onclick = () => {

  let allCorrect = true;

  selected.forEach(cid => {
    const matched = selectedPairs.get(cid);

    const leftBtn = leftColumn.querySelector(`[data-cid="${cid}"]`);
    const rightBtn = rightColumn.querySelector(`[data-cid="${matched}"]`);

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

  if (meta.type === "noun") {
    return String(nounPhrase(targetLang, cid)).toLowerCase();
  }

  // ✅ ADD THIS FALLBACK (CRITICAL)
  return String(surfaceForm(targetLang, cid)).toLowerCase();
});

  const wordBank = shuffle([...correctWords]);

  const assignments = new Map(); // slotIndex → word
  let selectedWord = null;

  content.innerHTML = `
  <div style="margin-bottom:20px;">
    <strong>${supportSentence}</strong>
    ${disambiguation ? `<div style="font-size:12px;opacity:0.7;margin-top:4px;">${disambiguation}</div>` : ""}
  </div>

    <div id="slot-container" class="slot-container"></div>

    <div id="word-bank" class="word-bank-container"></div>

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
  const wrap = document.createElement("div");
  wrap.className = "word-bank-chip";

  const btn = document.createElement("button");
  btn.textContent = word;

  btn.onclick = () => {
    if (selectedWord && selectedWord !== btn) {
      selectedWord.classList.remove("selected");
    }

    selectedWord = btn;
    btn.classList.add("selected");
  };

  wrap.appendChild(btn);
  wrap.appendChild(createTtsBtn(word, targetLang));
  bankContainer.appendChild(wrap);
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

    selectedWord.closest('div').remove();
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
      <input id="l7-input" type="text" class="free-input" />
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
        Proper form: <strong>${targetSentence}</strong> ${ttsHtml(targetSentence, targetLang)}
      </div>`;
    wireTts();
  }

  if (resultType === "incorrect") {
    inputField.style.borderColor = "#D32F2F";
    feedbackDiv.innerHTML = `
      <div style="color:#D32F2F;">
        ${ui("incorrect")}.<br/>
        Correct answer: <strong>${targetSentence}</strong> ${ttsHtml(targetSentence, targetLang)}
      </div>`;
    wireTts();
  }

  // 🔁 Replace Check with Continue
  checkBtn.textContent = ui("continue");
  checkBtn.onclick = () => {
    setTimeout(() => renderNext(targetLang, supportLang), 0);
return;
  };
};
}

// -----------------------------------------------------------------
// Alphabet overlay
// -----------------------------------------------------------------
const alphabetBtn     = document.getElementById("alphabet-btn");
const alphabetOverlay = document.getElementById("alphabet-overlay");
const alphabetClose   = document.getElementById("alphabet-close");

alphabetBtn.addEventListener("click", () => {
  renderAlphabetOverlay(languageState.target);
  alphabetOverlay.classList.remove("hidden");
});

alphabetClose.addEventListener("click", () => {
  alphabetOverlay.classList.add("hidden");
});

// Escape key — closes alphabet overlay and feedback modal
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    alphabetOverlay.classList.add("hidden");
    document.getElementById("feedback-modal").classList.add("hidden");
  }
});

// ---------------------------------------------------------------
// Feedback / bug report
// ---------------------------------------------------------------
(function initFeedback() {
  const feedbackBtn    = document.getElementById("feedback-btn");
  const feedbackModal  = document.getElementById("feedback-modal");
  const feedbackClose  = document.getElementById("feedback-close");
  const feedbackText   = document.getElementById("feedback-text");
  const feedbackCtx    = document.getElementById("feedback-context");
  const feedbackSubmit = document.getElementById("feedback-submit");
  const feedbackStatus = document.getElementById("feedback-status");

  function buildContext() {
    const target  = languageState.target  || "—";
    const support = languageState.support || "—";
    const email   = localStorage.getItem("zth_email") || "not logged in";
    return { target, support, email, version: APP_VERSION };
  }

  function showContext() {
    const { target, support, email, version } = buildContext();
    feedbackCtx.textContent =
      `Language: ${target} · Support: ${support} · User: ${email} · v${version}`;
  }

  feedbackBtn.addEventListener("click", () => {
    feedbackText.value = "";
    feedbackStatus.textContent = "";
    feedbackStatus.classList.add("hidden");
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = ui("feedbackSubmit");
    showContext();
    feedbackModal.classList.remove("hidden");
    feedbackText.focus();
  });

  feedbackClose.addEventListener("click", () => {
    feedbackModal.classList.add("hidden");
  });

  feedbackModal.addEventListener("click", e => {
    if (e.target === feedbackModal) feedbackModal.classList.add("hidden");
  });

  feedbackSubmit.addEventListener("click", async () => {
    const message = feedbackText.value.trim();
    if (!message) { feedbackText.focus(); return; }

    const { target, support, email, version } = buildContext();

    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = ui("feedbackSending");

    try {
      const body = new URLSearchParams({
        "form-name": "bug-report",
        message,
        language: target,
        level: support,
        email,
        version
      });

      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      if (res.ok) {
        feedbackStatus.textContent = ui("feedbackSent");
        feedbackStatus.classList.remove("hidden");
        feedbackText.value = "";
        setTimeout(() => feedbackModal.classList.add("hidden"), 2000);
      } else {
        throw new Error("Non-OK response");
      }
    } catch {
      feedbackStatus.textContent = ui("feedbackFailed");
      feedbackStatus.classList.remove("hidden");
      feedbackSubmit.disabled = false;
      feedbackSubmit.textContent = ui("feedbackSubmit");
    }
  });
})();

function updateAlphabetButton(langCode) {
  const data = LANG_FILE_CACHE[langCode];
  if (data?.alphabet?.sections?.length) {
    // Use the first character as a visual hint on the button
    const firstChar = data.alphabet.sections[0].letters[0]?.char || "ABC";
    alphabetBtn.textContent = firstChar;
    alphabetBtn.classList.remove("hidden");
  } else {
    alphabetBtn.classList.add("hidden");
  }
}

function renderAlphabetOverlay(langCode) {
  const data = LANG_FILE_CACHE[langCode];
  if (!data?.alphabet) return;

  const langMeta  = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
  const titleEl   = document.getElementById("alphabet-overlay-title");
  const contentEl = document.getElementById("alphabet-content");

  titleEl.textContent = langMeta ? langMeta.label + " — Script Guide" : "Script Guide";
  contentEl.innerHTML = "";

  for (const section of data.alphabet.sections) {
    const nameEl = document.createElement("p");
    nameEl.className = "alphabet-section-name";
    nameEl.textContent = section.name;
    contentEl.appendChild(nameEl);

    const grid = document.createElement("div");
    grid.className = "letter-grid";

    for (const letter of section.letters) {
      const card = document.createElement("div");
      card.className = "letter-card";
      card.style.cursor = "pointer";
      card.title = "Tap to hear";

      const charEl = document.createElement("span");
      charEl.className = "letter-char";
      charEl.textContent = letter.char;
      card.appendChild(charEl);

      const romanEl = document.createElement("span");
      romanEl.className = "letter-romanization";
      romanEl.textContent = letter.romanization;
      card.appendChild(romanEl);

      if (letter.sound) {
        const soundEl = document.createElement("span");
        soundEl.className = "letter-sound";
        soundEl.textContent = letter.sound;
        card.appendChild(soundEl);
      }

      const ttsText = letter.ttsText || letter.char;
      card.addEventListener("click", () => speakLetters(ttsText, langCode, charEl));
      prefetchTTS(ttsText, langCode);

      grid.appendChild(card);
    }

    contentEl.appendChild(grid);
  }
}

  async function enterLanguage(langCode) {

  languageState.target = langCode;

  await loadAndMergeVocab();

  BUNDLE_INDEX = buildBundleIndex();

  if (!USER.runs[langCode]) {
    run = createRunState();
    await loadTemplates([]);
    languageScreen.classList.remove("active");
    showReasonScreen();

    return;
  }

  run = USER.runs[langCode];
  
  // 🔥 CONTENT VERSION CHECK
if (!run.contentVersion || run.contentVersion !== CONTENT_VERSION) {
  console.warn("Content version mismatch → resetting run");

  run = createRunState();

  USER.runs[langCode] = run;
  saveUser();
}
  await loadTemplates(run.selectedResourcePacks || []);
  languageScreen.classList.remove("active");
  learningScreen.classList.add("active");
  updateAlphabetButton(languageState.target);
  renderNext(languageState.target, languageState.support);
}


 
function endSession(targetLang, supportLang) {

  run.sessionNumber++;

 releaseNextBundle(run);

  run.sessionComplete = false;
  run.sessionAttempts = {};
  run.sessionLevelUps = {};
  run.sessionExerciseCount = 0;

  const crossed = pendingMilestones(run);
  const milestone = crossed.length ? crossed[crossed.length - 1] : null;
  if (crossed.length) markMilestonesShown(run, crossed);

  USER.runs[languageState.target] = run;
  saveUser();

  const finishedSession = run.sessionNumber - 1;

  try {
    if (window.__zthBeacon) {
      window.__zthBeacon("session_complete", {
        email: localStorage.getItem("zth_email") || "",
        targetLang,
        supportLang,
        sessionNumber: finishedSession,
        milestone: milestone || null,
        version: APP_VERSION
      });
    }
  } catch (_) { /* never let the beacon throw */ }

  showRoadmap({
    sessionNumber: finishedSession,
    showCoaching: finishedSession >= 3,
    milestone,
    onContinue: () => {
      setTimeout(() => {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        learningScreen.classList.add("active");
        renderNext(targetLang, supportLang);
      }, 0);
    }
  });
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
  let candidates = run.released.filter(cid => {
    if (excluded.has(cid)) return false;

    const st = ensureProgress(cid);
    if (st.completed) return false;

    const meta = window.GLOBAL_VOCAB.concepts[cid];
    const isModifier = meta?.type === "adjective" || meta?.type === "number";

    // Level 1 intro gate
    if (st.level === 1 && !isModifier && !canConceptBeIntroduced(cid)) {
      return false;
    }

    return true;
  });

  // Fallback: if intro gate blocked everything, retry without it
  if (!candidates.length) {
    candidates = run.released.filter(cid => {
      if (excluded.has(cid)) return false;
      return !ensureProgress(cid).completed;
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const levelDiff = levelOf(a) - levelOf(b);
    if (levelDiff !== 0) return levelDiff;
    return Math.random() - 0.5;
  });

  return candidates[0];
}
// Rotate the subject pronoun in a template to a different one the learner
// has already unlocked. Widens effective variety without writing new
// templates: "I see a pokemon" becomes "You see a pokemon" / "He sees a
// pokemon" / "We see a pokemon" depending on what pronouns are released.
// Skipped when the target concept *is* the subject (can't swap the very
// thing we're teaching), when the template uses a bespoke structure
// (copular/complex — their renderers read named slots), or when there's
// nothing to swap to.
function maybeVarySubject(tpl, targetConcept) {
  if (!tpl || !Array.isArray(tpl.concepts)) return tpl;
  if (tpl.structure) return tpl; // bespoke structures use named slots
  const subjectIdx = tpl.concepts.findIndex(c =>
    window.GLOBAL_VOCAB.concepts[c]?.type === "pronoun"
  );
  if (subjectIdx < 0) return tpl;
  const currentSubject = tpl.concepts[subjectIdx];
  if (currentSubject === targetConcept) return tpl;

  const alternatives = run.released.filter(c => {
    if (c === currentSubject) return false;
    const m = window.GLOBAL_VOCAB.concepts[c];
    if (m?.type !== "pronoun") return false;
    const st = ensureProgress(c);
    return !st.completed && st.level >= 4;
  });
  if (!alternatives.length) return tpl;
  if (Math.random() >= 0.45) return tpl;

  const newSubject = alternatives[Math.floor(Math.random() * alternatives.length)];
  const newConcepts = [...tpl.concepts];
  newConcepts[subjectIdx] = newSubject;

  const modified = { ...tpl, concepts: newConcepts, render: { ...(tpl.render || {}) } };

  // Regenerate the support-language gloss so it matches the swapped subject.
  // buildSentence is the same engine used for target rendering (and is
  // already used for support lang in other exercise types), so it produces
  // consistently-built glosses without any new grammar rules.
  const supportLang = languageState.support || "en";
  try {
    const regenerated = buildSentence(supportLang, modified);
    if (regenerated) modified.render[supportLang] = regenerated;
  } catch (e) {
    // On any failure, fall back to the original template unchanged.
    return tpl;
  }
  return modified;
}

const POSSESSIVE_SUBJECT_CLASH = {
  "MY":    ["FIRST_PERSON_SINGULAR"],
  "YOUR":  ["SECOND_PERSON", "SECOND_PERSON_PLURAL"],
  "HIS":   ["HE"],
  "HER":   ["SHE"],
  "OUR":   ["FIRST_PERSON_PLURAL"],
  "THEIR": ["THIRD_PERSON_PLURAL"]
};
const POSSESSIVE_IDS = new Set(Object.keys(POSSESSIVE_SUBJECT_CLASH));

function chooseTemplateForConcept(cid) {

  const meta = window.GLOBAL_VOCAB.concepts[cid];

  let eligible;

  // Modifier concepts (adjective/number)
  if (meta?.type === "adjective" || meta?.type === "number") {

    const isPossessive = meta.semantic_role === "possessive";
    const clashes = isPossessive ? (POSSESSIVE_SUBJECT_CLASH[cid] || []) : [];

    eligible = TEMPLATE_CACHE.filter(tpl => {
      if (!templateEligible(tpl)) return false;
      if (!tpl.concepts.some(c => window.GLOBAL_VOCAB.concepts[c]?.type === "noun")) return false;
      // Numbers don't make sense in copular sentences ("He is two a leader")
      if (meta.type === "number" && tpl.concepts.includes("BE")) return false;
      // Possessives: reject templates that would produce reflexive/stacked nonsense.
      // Copular + matching subject → "He is his gym leader" (reflexive vacuum).
      // Any template with another possessive → "He is my his dad" (stacked).
      // Non-copular clashes like "I have my potion" are fine and allowed.
      if (isPossessive) {
        if (tpl.concepts.includes("BE") && clashes.some(s => tpl.concepts.includes(s))) return false;
        if (tpl.concepts.some(c => c !== cid && POSSESSIVE_IDS.has(c))) return false;
      }
      return true;
    });

  } else {

    // Primary: template contains cid and all concepts are released & not completed
    eligible = TEMPLATE_CACHE.filter(tpl =>
      tpl.concepts.includes(cid) &&
      templateEligible(tpl)
    );

    // Fallback: keep the cid requirement, but allow completed companion concepts.
    // A Level 1 intro must USE the word being introduced — never show a support
    // sentence that doesn't contain the target (e.g. introducing "She" with "I eat food").
    if (!eligible.length) {
      eligible = TEMPLATE_CACHE.filter(tpl => {
        if (!tpl.concepts.includes(cid)) return false;
        if (ensureTemplateProgress(tpl).completed) return false;
        return tpl.concepts.every(c => run.released.includes(c));
      });
    }

  }

  if (!eligible.length) return null;

  const picked = eligible[Math.floor(Math.random() * eligible.length)];
  return maybeVarySubject(picked, cid);
}
function renderNext(targetLang, supportLang) {
  markExerciseStart();
  // Retrigger the fade-in animation on every new exercise. Removing
  // and force-reflowing the class ensures the keyframes replay.
  if (content) {
    content.classList.remove("exercise-enter");
    void content.offsetWidth;
    content.classList.add("exercise-enter");
  }
  // --- Progress bar update ---
const progress = calculateWeightedProgress(run);
const bar = document.getElementById("progress-bar-fill");
if (bar) {
  bar.style.width = progress + "%";
}
  if (!run) return;


  if (run.sessionComplete) {
    return endSession(targetLang, supportLang);
  }

  // Cap session length so it stays predictable (~25 answered exercises).
  // Counter is incremented in applyResult() and reset in endSession().
  if ((run.sessionExerciseCount || 0) >= 25) {
    run.sessionComplete = true;
    return endSession(targetLang, supportLang);
  }

  const excluded = new Set();
  let renderedSomething = false;

for (let attempts = 0; attempts < 25; attempts++) {

  if (attempts >= 24) {
    console.warn("RenderNext fallback triggered");

    run.sessionComplete = true;
    return endSession(targetLang, supportLang);
  }

  const targetConcept = chooseConcept(excluded);
  run.lastTargetConcept = targetConcept;

  // 🔥 HARD STOP: nothing left to try
  if (excluded.size >= run.released.length) {
    run.sessionComplete = true;
    return endSession(targetLang, supportLang);
  }

  if (!targetConcept) {

    const canShowAnything = run.released.some(cid => {

      if (excluded.has(cid)) return false; // 🔥 NEW: respect exclusions

      const st = ensureProgress(cid);
      if (st.completed) return false;

      const level = st.level;

      if (level === 1) {
        return canConceptBeIntroduced(cid);
      }

      return canConceptBeTested(cid);
    });

    if (!canShowAnything) {
      run.sessionComplete = true;
      return endSession(targetLang, supportLang);
    }

    decrementCooldowns();
    setTimeout(() => renderNext(targetLang, supportLang), 0);
    return;
  }

  const level = levelOf(targetConcept);

  // ✅ Level 1
  if (level === 1) {
    const tpl = chooseTemplateForConcept(targetConcept);

    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    renderExposure(targetLang, supportLang, tpl, targetConcept);
    renderedSomething = true;
    run.exerciseCounter++;
    return;
  }

  // ❗ validation
  if (!canConceptBeTested(targetConcept)) {
    excluded.add(targetConcept);
    continue;
  }

 // ---------- Level 2 ----------
if (level === 2) {

  // ✅ 1. Get a template for sentence context
  const tpl = chooseTemplateForConcept(targetConcept);

  if (!tpl) {
    excluded.add(targetConcept);
    continue;
  }

  // ✅ 2. Enforce spacing rule (FIXES repeat bug)
  if (!passesSpacingRule(targetConcept)) {
    excluded.add(targetConcept);
    continue;
  }

  // ✅ 3. Build concept-based question
  const q = buildLevel2Question(targetConcept, targetLang, supportLang);

  if (!q) {
    excluded.add(targetConcept);
    continue;
  }

  // ✅ 4. Build sentence (THIS was missing)
  const sentence = buildSentence(targetLang, tpl, targetConcept);
  const surface = safeSurfaceForConcept(tpl, targetLang, targetConcept);

  subtitle.textContent = ui("level") + " " + level;

  let selectedOption = null;

  content.innerHTML = `
    <p>${safe(sentence)} ${ttsHtml(sentence, targetLang)}</p>
    <p><strong>${ui("chooseTranslation")}</strong></p>
    <h2>${safe(surface)} ${ttsHtml(surface, targetLang)}</h2>
    <div id="choices"></div>
    <div style="margin-top:20px;text-align:center;">
      <button id="check-btn" disabled>${ui("check")}</button>
    </div>
  `;
  wireTts();

  const container = document.getElementById("choices");
  const checkBtn = document.getElementById("check-btn");

  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = surfaceForm(supportLang, opt);

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
      const value = q.options.find(o => surfaceForm(supportLang, o) === btn.textContent);
      if (value === q.answer) btn.classList.add("correct");
      if (value === selectedOption && !correct) btn.classList.add("incorrect");
    });

    decrementCooldowns();
    applyResult(targetConcept, correct);

    checkBtn.textContent = ui("continue");
    checkBtn.onclick = () => renderNext(targetLang, supportLang);
  };

  renderedSomething = true;
  run.exerciseCounter++;
  return;
}

  // ---------- Level 3 ----------
  if (level === 3) {

    const tpl = chooseTemplateForConcept(targetConcept);
    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    const result = renderRecognitionL3(targetLang, supportLang, tpl, targetConcept);

    if (result === null) {
      excluded.add(targetConcept);
      continue;
    }

    renderedSomething = true;
    run.exerciseCounter++;
    return;
  }

  // ---------- Level 4 ----------
  if (level === 4) {

    const tpl = chooseTemplateForConcept(targetConcept);
    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    const result = renderRecognitionL4(targetLang, supportLang, tpl, targetConcept);

    if (result === null) {
      excluded.add(targetConcept);
      continue;
    }

    renderedSomething = true;
    run.exerciseCounter++;
    return;
  }

  // ---------- Level 5 ----------
  if (level === 5) {
    const eligibleL5 = run.released.filter(cid => {
      const st = ensureProgress(cid);
      return st.level === 5 && !st.completed && passesSpacingRule(cid);
    });

    // Dedup by target-language surface form so matching never shows duplicates
    const seenForms = new Set();
    const uniqueL5 = eligibleL5.filter(cid => {
      const form = formOf(targetLang, cid);
      if (seenForms.has(form)) return false;
      seenForms.add(form);
      return true;
    });

    if (uniqueL5.length >= 5) {
      renderMatchingL5(targetLang, supportLang);
      renderedSomething = true;
      run.exerciseCounter++;
      return;
    }

    // Not enough peers for a matching exercise — skip this concept entirely
    excluded.add(targetConcept);
    continue;
  }

  // ---------- Level 6 ----------
  if (level === 6) {

    const tpl = chooseTemplateForConcept(targetConcept);
    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    renderSentenceBuilderL6(targetLang, supportLang, tpl, targetConcept);
    renderedSomething = true;
    run.exerciseCounter++;
    return;
  }

  // ---------- Level 7 ----------
  if (level === 7) {

    const tpl = chooseTemplateForConcept(targetConcept);
    if (!tpl) {
      excluded.add(targetConcept);
      continue;
    }

    renderFreeProductionL7(targetLang, supportLang, tpl);
    renderedSomething = true;
    run.exerciseCounter++;
    return;
  }

  excluded.add(targetConcept);
}

if (!renderedSomething) {
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
document.getElementById("start-run").onclick = async () => {

  if (!run.selectedResourcePacks || run.selectedResourcePacks.length === 0) {
    alert(ui("selectPack"));
    return;
  }

  run.releasePlan = buildReleasePlan(run.selectedResourcePacks);
  run.releasePlanIndex = 0;
  await loadTemplates(run.selectedResourcePacks);

  // ✅ Only 1 bundle at start
releaseNextBundle(run);

  run.setupComplete = true;

  USER.runs[languageState.target] = run;
  saveUser();

  showRoadmap({
    continueKey: "roadmapBegin",
    onContinue: () => {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      learningScreen.classList.add("active");
      updateAlphabetButton(languageState.target);
      renderNext(languageState.target, languageState.support);
    }
  });
};

const journeyBtn = document.getElementById("journey-btn");
if (journeyBtn) {
  journeyBtn.addEventListener("click", () => {
    if (!run || !languageState.target) return;
    showRoadmap({
      backTo: () => {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        learningScreen.classList.add("active");
      },
      onContinue: () => {
        document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
        learningScreen.classList.add("active");
      }
    });
  });
}

    

 function returnToHome() {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  startScreen.classList.add("active");
}

if (quitBtn) {
  quitBtn.addEventListener("click", returnToHome);
}

if (hubQuitBtn) {
  hubQuitBtn.addEventListener("click", returnToHome);
}
if (resetBtn) {
  resetBtn.onclick = async () => {

    const confirmed = confirm("Reset ALL progress? This cannot be undone.");
    if (!confirmed) return;

    const email = localStorage.getItem("zth_email")?.toLowerCase();

    // 🔥 Reset user structure (clean, safe)
    USER = createEmptyUser();

    // 🔥 Save locally
    localStorage.setItem("zth_user", JSON.stringify(USER));

    // 🔥 Sync to server (IMPORTANT)
    if (email) {
      await fetch("/.netlify/functions/saveUser", {
        method: "POST",
        body: JSON.stringify({
          email,
          user: USER
        })
      });
    }

    location.reload();
  };
}
if (logoutBtn) {
  logoutBtn.onclick = () => {

    const confirmed = confirm("Log out and reset local data?");
    if (!confirmed) return;

    // 🔥 Clear auth + user
    localStorage.removeItem("zth_email");
    localStorage.removeItem("zth_user");

    // Optional: clear everything (safer fail-safe)
    // localStorage.clear();

    location.reload();
  };
}
window.canConceptBeTested = canConceptBeTested;
window.__app = { get run(){ return run; } };
});
