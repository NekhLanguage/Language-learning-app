#!/usr/bin/env node
// One-shot: add concept definitions + surface forms for the 46 concepts that
// CORE_BUNDLES references but that don't exist in any vocab or lang file.
// Run from repo root: node scripts/fill-missing-concepts.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------- 1. Concept definitions ----------
// Grouped by target source file. Minimal, follows existing patterns.

const profile = () => ({ see_translate: true, match: true, sentence_use: true, writing: true });

const adjectives = [
  // Colors
  { id: "BLACK", role: "property_color" },
  { id: "WHITE", role: "property_color" },
  { id: "RED",    role: "property_color" },
  { id: "BLUE",   role: "property_color" },
  { id: "GREEN",  role: "property_color" },
  { id: "YELLOW", role: "property_color" },
  { id: "PURPLE", role: "property_color" },
  { id: "ORANGE", role: "property_color" },
  // Speed
  { id: "FAST",   role: "property_speed" },
  { id: "SLOW",   role: "property_speed" },
  // Length
  { id: "LONG",   role: "property_size" },
  { id: "SHORT",  role: "property_size" },
  // Weight
  { id: "HEAVY",  role: "property_weight" },
  { id: "LIGHT",  role: "property_weight" },
  // Brightness
  { id: "DARK",   role: "property_brightness" },
  // Age
  { id: "YOUNG",  role: "property_time" },
  // Direction-as-adjective
  { id: "RIGHT",  role: "property_direction" },
  { id: "LEFT",   role: "property_direction" },
  // Correctness
  { id: "CORRECT", role: "property_quality" },
  { id: "WRONG",   role: "property_quality" },
  // General quality
  { id: "NICE",    role: "property_quality" }
];

const pronouns = [
  // Demonstratives + neuter pronoun
  { id: "THIS", role: "demonstrative" },
  { id: "THAT", role: "demonstrative" },
  { id: "IT",   role: "third_person_neuter" },
  // Standalone possessive pronouns
  { id: "ITS",    role: "possessive_pronoun" },
  { id: "MINE",   role: "possessive_pronoun" },
  { id: "YOURS",  role: "possessive_pronoun" },
  { id: "HERS",   role: "possessive_pronoun" },
  { id: "OURS",   role: "possessive_pronoun" },
  { id: "THEIRS", role: "possessive_pronoun" }
];

const timeWords = [
  // Time units
  { id: "HOUR",   type: "noun" },
  { id: "MINUTE", type: "noun" },
  { id: "SECOND", type: "noun" },
  // Time relations
  { id: "NOW",    type: "time_word" },
  { id: "BEFORE", type: "time_word" },
  { id: "AFTER",  type: "time_word" },
  { id: "LATER",  type: "time_word" },
  { id: "NEXT",   type: "time_word" },
  // Seasons
  { id: "SPRING", type: "noun" },
  { id: "SUMMER", type: "noun" },
  { id: "AUTUMN", type: "noun" },
  { id: "WINTER", type: "noun" }
];

const quantifiers = [
  { id: "ALL" }
];

const directions = [
  { id: "AROUND" }
];

const politeness = [
  { id: "THANKS" }
];

const verbs = [
  { id: "MAY" }
];

// ---------- 2. Surface forms per language ----------
// Simple array pattern { CID: ["form"] } for all languages.
// Native-script languages kept in native script; best-effort where needed.
// Users of beta languages can refine later.

const forms = {
  en: {
    BLACK: "black", WHITE: "white", RED: "red", BLUE: "blue", GREEN: "green",
    YELLOW: "yellow", PURPLE: "purple", ORANGE: "orange",
    FAST: "fast", SLOW: "slow", LONG: "long", SHORT: "short",
    HEAVY: "heavy", LIGHT: "light", DARK: "dark", YOUNG: "young",
    RIGHT: "right", LEFT: "left",
    CORRECT: "correct", WRONG: "wrong", NICE: "nice",
    THIS: "this", THAT: "that", IT: "it",
    ITS: "its", MINE: "mine", YOURS: "yours", HERS: "hers", OURS: "ours", THEIRS: "theirs",
    HOUR: "hour", MINUTE: "minute", SECOND: "second",
    NOW: "now", BEFORE: "before", AFTER: "after", LATER: "later", NEXT: "next",
    SPRING: "spring", SUMMER: "summer", AUTUMN: "autumn", WINTER: "winter",
    ALL: "all", AROUND: "around", THANKS: "thanks",
    MAY: "may"
  },
  pt: {
    BLACK: "preto", WHITE: "branco", RED: "vermelho", BLUE: "azul", GREEN: "verde",
    YELLOW: "amarelo", PURPLE: "roxo", ORANGE: "laranja",
    FAST: "rápido", SLOW: "lento", LONG: "longo", SHORT: "curto",
    HEAVY: "pesado", LIGHT: "leve", DARK: "escuro", YOUNG: "jovem",
    RIGHT: "direito", LEFT: "esquerdo",
    CORRECT: "correto", WRONG: "errado", NICE: "legal",
    THIS: "este", THAT: "aquele", IT: "ele",
    ITS: "seu", MINE: "meu", YOURS: "seu", HERS: "dela", OURS: "nosso", THEIRS: "deles",
    HOUR: "hora", MINUTE: "minuto", SECOND: "segundo",
    NOW: "agora", BEFORE: "antes", AFTER: "depois", LATER: "mais tarde", NEXT: "próximo",
    SPRING: "primavera", SUMMER: "verão", AUTUMN: "outono", WINTER: "inverno",
    ALL: "todo", AROUND: "ao redor", THANKS: "obrigado",
    MAY: "pode"
  },
  es: {
    BLACK: "negro", WHITE: "blanco", RED: "rojo", BLUE: "azul", GREEN: "verde",
    YELLOW: "amarillo", PURPLE: "morado", ORANGE: "naranja",
    FAST: "rápido", SLOW: "lento", LONG: "largo", SHORT: "corto",
    HEAVY: "pesado", LIGHT: "ligero", DARK: "oscuro", YOUNG: "joven",
    RIGHT: "derecho", LEFT: "izquierdo",
    CORRECT: "correcto", WRONG: "incorrecto", NICE: "agradable",
    THIS: "este", THAT: "ese", IT: "él",
    ITS: "su", MINE: "mío", YOURS: "tuyo", HERS: "suyo", OURS: "nuestro", THEIRS: "suyo",
    HOUR: "hora", MINUTE: "minuto", SECOND: "segundo",
    NOW: "ahora", BEFORE: "antes", AFTER: "después", LATER: "más tarde", NEXT: "próximo",
    SPRING: "primavera", SUMMER: "verano", AUTUMN: "otoño", WINTER: "invierno",
    ALL: "todo", AROUND: "alrededor", THANKS: "gracias",
    MAY: "puede"
  },
  fr: {
    BLACK: "noir", WHITE: "blanc", RED: "rouge", BLUE: "bleu", GREEN: "vert",
    YELLOW: "jaune", PURPLE: "violet", ORANGE: "orange",
    FAST: "rapide", SLOW: "lent", LONG: "long", SHORT: "court",
    HEAVY: "lourd", LIGHT: "léger", DARK: "sombre", YOUNG: "jeune",
    RIGHT: "droit", LEFT: "gauche",
    CORRECT: "correct", WRONG: "faux", NICE: "gentil",
    THIS: "ce", THAT: "cela", IT: "il",
    ITS: "son", MINE: "le mien", YOURS: "le tien", HERS: "le sien", OURS: "le nôtre", THEIRS: "le leur",
    HOUR: "heure", MINUTE: "minute", SECOND: "seconde",
    NOW: "maintenant", BEFORE: "avant", AFTER: "après", LATER: "plus tard", NEXT: "prochain",
    SPRING: "printemps", SUMMER: "été", AUTUMN: "automne", WINTER: "hiver",
    ALL: "tout", AROUND: "autour", THANKS: "merci",
    MAY: "peut"
  },
  de: {
    BLACK: "schwarz", WHITE: "weiß", RED: "rot", BLUE: "blau", GREEN: "grün",
    YELLOW: "gelb", PURPLE: "lila", ORANGE: "orange",
    FAST: "schnell", SLOW: "langsam", LONG: "lang", SHORT: "kurz",
    HEAVY: "schwer", LIGHT: "leicht", DARK: "dunkel", YOUNG: "jung",
    RIGHT: "rechts", LEFT: "links",
    CORRECT: "richtig", WRONG: "falsch", NICE: "nett",
    THIS: "dies", THAT: "das", IT: "es",
    ITS: "sein", MINE: "meins", YOURS: "deins", HERS: "ihrs", OURS: "unsers", THEIRS: "ihrs",
    HOUR: "Stunde", MINUTE: "Minute", SECOND: "Sekunde",
    NOW: "jetzt", BEFORE: "vor", AFTER: "nach", LATER: "später", NEXT: "nächster",
    SPRING: "Frühling", SUMMER: "Sommer", AUTUMN: "Herbst", WINTER: "Winter",
    ALL: "alle", AROUND: "herum", THANKS: "danke",
    MAY: "darf"
  },
  no: {
    BLACK: "svart", WHITE: "hvit", RED: "rød", BLUE: "blå", GREEN: "grønn",
    YELLOW: "gul", PURPLE: "lilla", ORANGE: "oransje",
    FAST: "rask", SLOW: "sakte", LONG: "lang", SHORT: "kort",
    HEAVY: "tung", LIGHT: "lett", DARK: "mørk", YOUNG: "ung",
    RIGHT: "høyre", LEFT: "venstre",
    CORRECT: "riktig", WRONG: "feil", NICE: "hyggelig",
    THIS: "dette", THAT: "det", IT: "det",
    ITS: "dets", MINE: "mitt", YOURS: "ditt", HERS: "hennes", OURS: "vårt", THEIRS: "deres",
    HOUR: "time", MINUTE: "minutt", SECOND: "sekund",
    NOW: "nå", BEFORE: "før", AFTER: "etter", LATER: "senere", NEXT: "neste",
    SPRING: "vår", SUMMER: "sommer", AUTUMN: "høst", WINTER: "vinter",
    ALL: "alle", AROUND: "rundt", THANKS: "takk",
    MAY: "kan"
  },
  tr: {
    BLACK: "siyah", WHITE: "beyaz", RED: "kırmızı", BLUE: "mavi", GREEN: "yeşil",
    YELLOW: "sarı", PURPLE: "mor", ORANGE: "turuncu",
    FAST: "hızlı", SLOW: "yavaş", LONG: "uzun", SHORT: "kısa",
    HEAVY: "ağır", LIGHT: "hafif", DARK: "karanlık", YOUNG: "genç",
    RIGHT: "sağ", LEFT: "sol",
    CORRECT: "doğru", WRONG: "yanlış", NICE: "güzel",
    THIS: "bu", THAT: "şu", IT: "o",
    ITS: "onun", MINE: "benim", YOURS: "senin", HERS: "onun", OURS: "bizim", THEIRS: "onların",
    HOUR: "saat", MINUTE: "dakika", SECOND: "saniye",
    NOW: "şimdi", BEFORE: "önce", AFTER: "sonra", LATER: "daha sonra", NEXT: "sonraki",
    SPRING: "ilkbahar", SUMMER: "yaz", AUTUMN: "sonbahar", WINTER: "kış",
    ALL: "tüm", AROUND: "etrafında", THANKS: "teşekkürler",
    MAY: "olabilir"
  },
  ja: {
    BLACK: "黒い", WHITE: "白い", RED: "赤い", BLUE: "青い", GREEN: "緑",
    YELLOW: "黄色い", PURPLE: "紫", ORANGE: "オレンジ",
    FAST: "速い", SLOW: "遅い", LONG: "長い", SHORT: "短い",
    HEAVY: "重い", LIGHT: "軽い", DARK: "暗い", YOUNG: "若い",
    RIGHT: "右", LEFT: "左",
    CORRECT: "正しい", WRONG: "間違った", NICE: "いい",
    THIS: "これ", THAT: "それ", IT: "それ",
    ITS: "その", MINE: "私の", YOURS: "あなたの", HERS: "彼女の", OURS: "私たちの", THEIRS: "彼らの",
    HOUR: "時間", MINUTE: "分", SECOND: "秒",
    NOW: "今", BEFORE: "前", AFTER: "後", LATER: "後で", NEXT: "次",
    SPRING: "春", SUMMER: "夏", AUTUMN: "秋", WINTER: "冬",
    ALL: "全て", AROUND: "周り", THANKS: "ありがとう",
    MAY: "かもしれない"
  },
  ko: {
    BLACK: "검은", WHITE: "하얀", RED: "빨간", BLUE: "파란", GREEN: "초록",
    YELLOW: "노란", PURPLE: "보라", ORANGE: "주황",
    FAST: "빠른", SLOW: "느린", LONG: "긴", SHORT: "짧은",
    HEAVY: "무거운", LIGHT: "가벼운", DARK: "어두운", YOUNG: "젊은",
    RIGHT: "오른쪽", LEFT: "왼쪽",
    CORRECT: "옳은", WRONG: "틀린", NICE: "좋은",
    THIS: "이것", THAT: "그것", IT: "그것",
    ITS: "그것의", MINE: "내 것", YOURS: "네 것", HERS: "그녀의 것", OURS: "우리 것", THEIRS: "그들 것",
    HOUR: "시간", MINUTE: "분", SECOND: "초",
    NOW: "지금", BEFORE: "전", AFTER: "후", LATER: "나중에", NEXT: "다음",
    SPRING: "봄", SUMMER: "여름", AUTUMN: "가을", WINTER: "겨울",
    ALL: "모두", AROUND: "주변", THANKS: "감사합니다",
    MAY: "일지도 모른다"
  },
  zh: {
    BLACK: "黑", WHITE: "白", RED: "红", BLUE: "蓝", GREEN: "绿",
    YELLOW: "黄", PURPLE: "紫", ORANGE: "橙",
    FAST: "快", SLOW: "慢", LONG: "长", SHORT: "短",
    HEAVY: "重", LIGHT: "轻", DARK: "黑暗", YOUNG: "年轻",
    RIGHT: "右", LEFT: "左",
    CORRECT: "正确", WRONG: "错误", NICE: "好",
    THIS: "这", THAT: "那", IT: "它",
    ITS: "它的", MINE: "我的", YOURS: "你的", HERS: "她的", OURS: "我们的", THEIRS: "他们的",
    HOUR: "小时", MINUTE: "分钟", SECOND: "秒",
    NOW: "现在", BEFORE: "之前", AFTER: "之后", LATER: "以后", NEXT: "下一个",
    SPRING: "春天", SUMMER: "夏天", AUTUMN: "秋天", WINTER: "冬天",
    ALL: "所有", AROUND: "周围", THANKS: "谢谢",
    MAY: "可能"
  },
  ar: {
    BLACK: "أسود", WHITE: "أبيض", RED: "أحمر", BLUE: "أزرق", GREEN: "أخضر",
    YELLOW: "أصفر", PURPLE: "بنفسجي", ORANGE: "برتقالي",
    FAST: "سريع", SLOW: "بطيء", LONG: "طويل", SHORT: "قصير",
    HEAVY: "ثقيل", LIGHT: "خفيف", DARK: "مظلم", YOUNG: "شاب",
    RIGHT: "يمين", LEFT: "يسار",
    CORRECT: "صحيح", WRONG: "خاطئ", NICE: "لطيف",
    THIS: "هذا", THAT: "ذلك", IT: "هو",
    ITS: "ـه", MINE: "لي", YOURS: "لك", HERS: "لها", OURS: "لنا", THEIRS: "لهم",
    HOUR: "ساعة", MINUTE: "دقيقة", SECOND: "ثانية",
    NOW: "الآن", BEFORE: "قبل", AFTER: "بعد", LATER: "لاحقًا", NEXT: "التالي",
    SPRING: "ربيع", SUMMER: "صيف", AUTUMN: "خريف", WINTER: "شتاء",
    ALL: "كل", AROUND: "حول", THANKS: "شكرا",
    MAY: "قد"
  },
  el: {
    BLACK: "μαύρος", WHITE: "λευκός", RED: "κόκκινος", BLUE: "μπλε", GREEN: "πράσινος",
    YELLOW: "κίτρινος", PURPLE: "μωβ", ORANGE: "πορτοκαλί",
    FAST: "γρήγορος", SLOW: "αργός", LONG: "μακρύς", SHORT: "κοντός",
    HEAVY: "βαρύς", LIGHT: "ελαφρύς", DARK: "σκοτεινός", YOUNG: "νέος",
    RIGHT: "δεξιός", LEFT: "αριστερός",
    CORRECT: "σωστός", WRONG: "λάθος", NICE: "ωραίος",
    THIS: "αυτό", THAT: "εκείνο", IT: "αυτό",
    ITS: "του", MINE: "δικό μου", YOURS: "δικό σου", HERS: "δικό της", OURS: "δικό μας", THEIRS: "δικό τους",
    HOUR: "ώρα", MINUTE: "λεπτό", SECOND: "δευτερόλεπτο",
    NOW: "τώρα", BEFORE: "πριν", AFTER: "μετά", LATER: "αργότερα", NEXT: "επόμενο",
    SPRING: "άνοιξη", SUMMER: "καλοκαίρι", AUTUMN: "φθινόπωρο", WINTER: "χειμώνας",
    ALL: "όλα", AROUND: "γύρω", THANKS: "ευχαριστώ",
    MAY: "μπορεί"
  },
  uk: {
    BLACK: "чорний", WHITE: "білий", RED: "червоний", BLUE: "синій", GREEN: "зелений",
    YELLOW: "жовтий", PURPLE: "фіолетовий", ORANGE: "помаранчевий",
    FAST: "швидкий", SLOW: "повільний", LONG: "довгий", SHORT: "короткий",
    HEAVY: "важкий", LIGHT: "легкий", DARK: "темний", YOUNG: "молодий",
    RIGHT: "правий", LEFT: "лівий",
    CORRECT: "правильний", WRONG: "неправильний", NICE: "гарний",
    THIS: "це", THAT: "те", IT: "воно",
    ITS: "його", MINE: "моє", YOURS: "твоє", HERS: "її", OURS: "наше", THEIRS: "їхнє",
    HOUR: "година", MINUTE: "хвилина", SECOND: "секунда",
    NOW: "зараз", BEFORE: "до", AFTER: "після", LATER: "пізніше", NEXT: "наступний",
    SPRING: "весна", SUMMER: "літо", AUTUMN: "осінь", WINTER: "зима",
    ALL: "всі", AROUND: "навколо", THANKS: "дякую",
    MAY: "може"
  }
};

// ---------- 3. Write concept definitions ----------
function addConcepts(filename, conceptDefs, buildConcept) {
  const p = path.join(ROOT, filename);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const existing = new Set((data.concepts || []).map(c => c.concept_id));
  let added = 0;
  for (const def of conceptDefs) {
    if (existing.has(def.id)) continue;
    data.concepts.push(buildConcept(def));
    added++;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ${filename}: +${added} concepts`);
}

console.log('Adding concept definitions…');
addConcepts('adjectives.json', adjectives, (d) => ({
  concept_id: d.id,
  type: "adjective",
  semantic_role: d.role,
  core: true,
  interaction_profile: profile()
}));
addConcepts('pronouns.json', pronouns, (d) => ({
  concept_id: d.id,
  type: "pronoun",
  semantic_role: d.role,
  core: true,
  interaction_profile: profile()
}));
addConcepts('time_words.json', timeWords, (d) => ({
  concept_id: d.id,
  type: d.type,
  core: true,
  interaction_profile: profile()
}));
addConcepts('quantifiers.json', quantifiers, (d) => ({
  concept_id: d.id,
  type: "quantifier",
  core: true,
  interaction_profile: profile()
}));
addConcepts('directions_positions.json', directions, (d) => ({
  concept_id: d.id,
  type: "direction",
  core: true,
  interaction_profile: profile()
}));
addConcepts('politeness_modality.json', politeness, (d) => ({
  concept_id: d.id,
  type: "politeness",
  core: true,
  interaction_profile: profile()
}));
addConcepts('verbs.json', verbs, (d) => ({
  concept_id: d.id,
  type: "verb",
  core: true,
  interaction_profile: profile()
}));

// ---------- 4. Write surface forms to lang files ----------
// Insert as simple arrays after the closing of "forms": { ... } existing
// entries. We do a surgical string splice so we don't reformat each file.

console.log('\nAdding surface forms per language…');
for (const [code, map] of Object.entries(forms)) {
  const p = path.join(ROOT, 'lang', `${code}.json`);
  let raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  const existing = new Set(Object.keys(data.forms || {}));

  const toAdd = Object.keys(map).filter(k => !existing.has(k));
  if (!toAdd.length) { console.log(`  ${code}: nothing to add`); continue; }

  // Find the last form entry before the closing "}"  of the forms block.
  // Supports two layouts we see in the repo:
  //   - one line per entry  ("KEY": ["value"])
  //   - multi-line array    ("KEY": [\n      "value"\n    ])
  // We locate the closing brace of forms and splice just before it.

  // Find the "forms": { block start, then scan for its matching closing brace.
  const formsStart = raw.indexOf('"forms": {');
  if (formsStart < 0) { console.log(`  ${code}: no forms block, skipped`); continue; }
  // Walk braces from formsStart onwards.
  let depth = 0;
  let i = raw.indexOf('{', formsStart);
  let closeIdx = -1;
  for (; i < raw.length; i++) {
    const c = raw[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx < 0) { console.log(`  ${code}: malformed forms block`); continue; }

  // Detect if the existing last entry line ends with a comma or not.
  // Look back from closeIdx for the previous non-whitespace character.
  let lookback = closeIdx - 1;
  while (lookback > formsStart && /\s/.test(raw[lookback])) lookback--;
  const lastChar = raw[lookback];
  const needsLeadingComma = (lastChar !== ',' && lastChar !== '{');

  // Match existing indent style of the file (2-space convention here).
  const indent = '    ';
  const snippet = toAdd
    .map(k => `${indent}"${k}": ${JSON.stringify([map[k]])}`)
    .join(',\n');

  const prefix = raw.slice(0, lookback + 1);
  const suffix = raw.slice(lookback + 1);
  const glue = needsLeadingComma ? ',\n' : '\n';
  const patched = prefix + glue + snippet + '\n  ' + suffix.trimStart();

  // Validate JSON before writing.
  try {
    JSON.parse(patched);
  } catch (e) {
    console.error(`  ${code}: patched output is not valid JSON, skipping`);
    console.error(`  ${e.message}`);
    continue;
  }
  fs.writeFileSync(p, patched);
  console.log(`  ${code}: +${toAdd.length} forms`);
}

console.log('\nDone.');
