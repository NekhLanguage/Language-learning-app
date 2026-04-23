#!/usr/bin/env node
// Fills in missing uiStrings entries per lang. Surgical string splice so the
// file's existing indentation style is preserved (some files use compact
// inline objects for forms, others multi-line; we don't want to reformat).
// Run from repo root: node scripts/fill-missing-i18n.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Per-language translations. Each entry is { langCode: { key: "translation" } }
// covering every UI string that wasn't already present in that lang file.
// Best-effort translations for the five non-Latin languages and the two Latin
// langs that were missing the feedback-modal strings. A native-speaker pass
// would further polish these; the goal here is to replace English fallbacks
// with grammatically correct native-script equivalents.
const translations = {
  ar: {
    reasonTitle: "لماذا {lang}؟",
    reasonSubtitle: "لا توجد إجابات خاطئة — هذا يساعدنا على الاحتفال باللحظات المهمة بالنسبة لك.",
    reasonContinue: "متابعة",
    reasonOptionTravel: "السفر",
    reasonOptionPerson: "شخص في حياتي",
    reasonOptionCareer: "العمل أو الدراسة",
    reasonOptionHeritage: "التراث",
    reasonOptionCulture: "الكتب والأفلام والموسيقى",
    reasonOptionFun: "للمتعة فقط",
    reasonDetailTravel: "إلى أين تتجه؟",
    reasonDetailPerson: "من هو؟",
    reasonDetailCareer: "ما الهدف؟",
    reasonDetailHeritage: "ما الصلة؟",
    reasonDetailCulture: "ما الذي يجذبك؟",
    reasonDetailPlaceholderTravel: "مثل: لشبونة",
    reasonDetailPlaceholderPerson: "مثل: شريكي",
    reasonDetailPlaceholderCareer: "مثل: عميل في مدريد",
    reasonDetailPlaceholderHeritage: "مثل: عائلتي من النرويج",
    reasonDetailPlaceholderCulture: "مثل: استوديو جيبلي",
    reasonDetailHint: "اختياري — لا بأس بالتخطي.",
    roadmapTitle: "رحلتك",
    roadmapCounter: "{done} من {total} محطة مكتملة",
    roadmapCounterFull: "{done} مكتملة · {inprogress} قيد التقدم · {ahead} متبقية",
    roadmapSessionFinished: "الجلسة {n} مكتملة. محطة أخرى خلفك.",
    roadmapBegin: "ابدأ رحلتك",
    roadmapBack: "← رجوع",
    journeyBtn: "الرحلة",
    milestoneHeadline: "{n} كلمة",
    milestoneGeneric: "كل واحدة منها — لك.",
    milestoneReasonTravel: "{detail} يقترب مع كل كلمة.",
    milestoneReasonPerson: "{detail} يقترب مع كل كلمة.",
    milestoneReasonCareer: "خطوة أخرى نحو {detail}.",
    milestoneReasonHeritage: "{detail} يعيش في هذه الكلمات.",
    milestoneReasonCulture: "{detail}، بصوتها الخاص.",
    milestoneReasonFun: "وأنت بدأت للتو."
  },
  el: {
    reasonTitle: "ΓΙΑΤΙ {lang};",
    reasonSubtitle: "Δεν υπάρχουν λάθος απαντήσεις — αυτό μας βοηθάει να γιορτάζουμε τις στιγμές που μετράνε για σένα.",
    reasonContinue: "ΣΥΝΕΧΕΙΑ",
    reasonOptionTravel: "Ταξίδι",
    reasonOptionPerson: "Κάποιος στη ζωή μου",
    reasonOptionCareer: "Δουλειά ή σχολείο",
    reasonOptionHeritage: "Ρίζες",
    reasonOptionCulture: "Βιβλία, ταινίες & μουσική",
    reasonOptionFun: "Για διασκέδαση",
    reasonDetailTravel: "Πού πας;",
    reasonDetailPerson: "Ποιος είναι;",
    reasonDetailCareer: "Ποιος είναι ο στόχος;",
    reasonDetailHeritage: "Ποια είναι η σύνδεση;",
    reasonDetailCulture: "Τι σε τραβάει;",
    reasonDetailPlaceholderTravel: "π.χ. Λισαβόνα",
    reasonDetailPlaceholderPerson: "π.χ. ο σύντροφός μου",
    reasonDetailPlaceholderCareer: "π.χ. ένας πελάτης στη Μαδρίτη",
    reasonDetailPlaceholderHeritage: "π.χ. η οικογένειά μου είναι από τη Νορβηγία",
    reasonDetailPlaceholderCulture: "π.χ. Studio Ghibli",
    reasonDetailHint: "Προαιρετικό — μπορείς να το παραλείψεις.",
    roadmapTitle: "ΤΟ ΤΑΞΙΔΙ ΣΟΥ",
    roadmapCounter: "{done} από {total} στάσεις ολοκληρωμένες",
    roadmapCounterFull: "{done} ολοκληρωμένες · {inprogress} σε εξέλιξη · {ahead} μπροστά",
    roadmapSessionFinished: "Η συνεδρία {n} ολοκληρώθηκε. Μία στάση ακόμη πίσω σου.",
    roadmapBegin: "ΞΕΚΙΝΑ ΤΟ ΤΑΞΙΔΙ ΣΟΥ",
    roadmapBack: "← ΠΙΣΩ",
    journeyBtn: "ΤΑΞΙΔΙ",
    milestoneHeadline: "{n} ΛΕΞΕΙΣ",
    milestoneGeneric: "Κάθε μία από αυτές — δική σου.",
    milestoneReasonTravel: "Το {detail} έρχεται πιο κοντά με κάθε λέξη.",
    milestoneReasonPerson: "Ο/Η {detail} έρχεται πιο κοντά με κάθε λέξη.",
    milestoneReasonCareer: "Ακόμα ένα βήμα προς το {detail}.",
    milestoneReasonHeritage: "Το {detail} ζει σε αυτές τις λέξεις.",
    milestoneReasonCulture: "Το {detail}, στη δική του φωνή.",
    milestoneReasonFun: "Και μόλις ξεκινάς."
  },
  ja: {
    reasonTitle: "なぜ{lang}？",
    reasonSubtitle: "間違った答えはありません — これは大切な瞬間を一緒に祝うためのものです。",
    reasonContinue: "続ける",
    reasonOptionTravel: "旅行",
    reasonOptionPerson: "大切な人",
    reasonOptionCareer: "仕事や学校",
    reasonOptionHeritage: "ルーツ",
    reasonOptionCulture: "本、映画、音楽",
    reasonOptionFun: "楽しみのため",
    reasonDetailTravel: "どこへ行きますか？",
    reasonDetailPerson: "誰ですか？",
    reasonDetailCareer: "目標は何ですか？",
    reasonDetailHeritage: "どんな繋がりですか？",
    reasonDetailCulture: "何に惹かれていますか？",
    reasonDetailPlaceholderTravel: "例：リスボン",
    reasonDetailPlaceholderPerson: "例：パートナー",
    reasonDetailPlaceholderCareer: "例：マドリードのクライアント",
    reasonDetailPlaceholderHeritage: "例：家族はノルウェー出身",
    reasonDetailPlaceholderCulture: "例：スタジオジブリ",
    reasonDetailHint: "任意 — スキップしても大丈夫です。",
    roadmapTitle: "あなたの旅",
    roadmapCounter: "全{total}ステップ中{done}完了",
    roadmapCounterFull: "完了 {done} · 進行中 {inprogress} · 残り {ahead}",
    roadmapSessionFinished: "セッション{n}完了。また一歩前進。",
    roadmapBegin: "旅を始める",
    roadmapBack: "← 戻る",
    journeyBtn: "旅",
    milestoneHeadline: "{n}語",
    milestoneGeneric: "どの言葉もあなたのもの。",
    milestoneReasonTravel: "{detail}が一語ごとに近づく。",
    milestoneReasonPerson: "{detail}と一語ごとに近くなる。",
    milestoneReasonCareer: "{detail}へまた一歩。",
    milestoneReasonHeritage: "{detail}がこれらの言葉の中に生きている。",
    milestoneReasonCulture: "{detail}を、その言葉で。",
    milestoneReasonFun: "まだ始まったばかり。"
  },
  ko: {
    reasonTitle: "왜 {lang}?",
    reasonSubtitle: "틀린 답은 없습니다 — 여러분에게 중요한 순간을 함께 축하하기 위한 것입니다.",
    reasonContinue: "계속하기",
    reasonOptionTravel: "여행",
    reasonOptionPerson: "소중한 사람",
    reasonOptionCareer: "일 또는 학교",
    reasonOptionHeritage: "뿌리",
    reasonOptionCulture: "책, 영화, 음악",
    reasonOptionFun: "그냥 재미로",
    reasonDetailTravel: "어디로 가시나요?",
    reasonDetailPerson: "누구인가요?",
    reasonDetailCareer: "목표가 무엇인가요?",
    reasonDetailHeritage: "어떤 연결이 있나요?",
    reasonDetailCulture: "무엇에 끌리시나요?",
    reasonDetailPlaceholderTravel: "예: 리스본",
    reasonDetailPlaceholderPerson: "예: 내 파트너",
    reasonDetailPlaceholderCareer: "예: 마드리드의 고객",
    reasonDetailPlaceholderHeritage: "예: 가족이 노르웨이 출신",
    reasonDetailPlaceholderCulture: "예: 스튜디오 지브리",
    reasonDetailHint: "선택 사항 — 건너뛰어도 괜찮습니다.",
    roadmapTitle: "나의 여정",
    roadmapCounter: "총 {total}개 중 {done}개 완료",
    roadmapCounterFull: "{done}개 완료 · {inprogress}개 진행 중 · {ahead}개 남음",
    roadmapSessionFinished: "세션 {n} 완료. 또 한 걸음 전진.",
    roadmapBegin: "여정 시작하기",
    roadmapBack: "← 뒤로",
    journeyBtn: "여정",
    milestoneHeadline: "{n}개 단어",
    milestoneGeneric: "모두 당신의 것.",
    milestoneReasonTravel: "{detail}이(가) 한 단어씩 가까워집니다.",
    milestoneReasonPerson: "{detail}이(가) 한 단어씩 가까워집니다.",
    milestoneReasonCareer: "{detail}을(를) 향한 또 한 걸음.",
    milestoneReasonHeritage: "{detail}이(가) 이 단어들 속에 살아 있습니다.",
    milestoneReasonCulture: "{detail}, 그 자체의 목소리로.",
    milestoneReasonFun: "이제 막 시작입니다."
  },
  uk: {
    reasonTitle: "ЧОМУ {lang}?",
    reasonSubtitle: "Неправильних відповідей немає — це просто допомагає нам святкувати моменти, які для вас важливі.",
    reasonContinue: "ДАЛІ",
    reasonOptionTravel: "Подорож",
    reasonOptionPerson: "Хтось у моєму житті",
    reasonOptionCareer: "Робота чи навчання",
    reasonOptionHeritage: "Коріння",
    reasonOptionCulture: "Книги, кіно та музика",
    reasonOptionFun: "Просто для задоволення",
    reasonDetailTravel: "Куди ви прямуєте?",
    reasonDetailPerson: "Хто це?",
    reasonDetailCareer: "Яка мета?",
    reasonDetailHeritage: "Який зв'язок?",
    reasonDetailCulture: "Що вас приваблює?",
    reasonDetailPlaceholderTravel: "наприклад, Лісабон",
    reasonDetailPlaceholderPerson: "наприклад, мій партнер",
    reasonDetailPlaceholderCareer: "наприклад, клієнт у Мадриді",
    reasonDetailPlaceholderHeritage: "наприклад, моя родина з Норвегії",
    reasonDetailPlaceholderCulture: "наприклад, студія Ґіблі",
    reasonDetailHint: "Необов'язково — можна пропустити.",
    roadmapTitle: "ВАША ПОДОРОЖ",
    roadmapCounter: "{done} з {total} зупинок завершено",
    roadmapCounterFull: "{done} завершено · {inprogress} у процесі · {ahead} попереду",
    roadmapSessionFinished: "Сесія {n} завершена. Ще одна зупинка позаду.",
    roadmapBegin: "ПОЧАТИ ПОДОРОЖ",
    roadmapBack: "← НАЗАД",
    journeyBtn: "ПОДОРОЖ",
    milestoneHeadline: "{n} СЛІВ",
    milestoneGeneric: "Кожне з них — ваше.",
    milestoneReasonTravel: "{detail} стає ближчим з кожним словом.",
    milestoneReasonPerson: "{detail} стає ближчим з кожним словом.",
    milestoneReasonCareer: "Ще один крок до {detail}.",
    milestoneReasonHeritage: "{detail} живе в цих словах.",
    milestoneReasonCulture: "{detail}, його власним голосом.",
    milestoneReasonFun: "І ви тільки починаєте."
  },
  fr: {
    feedbackOpen: "Signaler un bug ou donner un retour",
    feedbackClose: "Fermer le retour",
    feedbackTitle: "Signaler un bug",
    feedbackSubtitle: "Dites-nous ce qui n'a pas fonctionné — nous lisons chaque rapport.",
    feedbackPlaceholder: "Décrivez le problème...",
    feedbackSubmit: "Envoyer le rapport",
    feedbackSending: "Envoi…",
    feedbackSent: "✓ Rapport envoyé — merci !",
    feedbackFailed: "Échec de l'envoi — veuillez réessayer."
  },
  zh: {
    feedbackOpen: "报告错误或提供反馈",
    feedbackClose: "关闭反馈",
    feedbackTitle: "报告错误",
    feedbackSubtitle: "告诉我们出了什么问题——我们会阅读每一份报告。",
    feedbackPlaceholder: "描述问题...",
    feedbackSubmit: "发送报告",
    feedbackSending: "发送中…",
    feedbackSent: "✓ 报告已发送——谢谢！",
    feedbackFailed: "发送失败——请重试。"
  }
};

// A second pass: keys that exist in fr/zh but still hold the English
// placeholder value from an earlier batch. These need to be replaced, not
// just added.
const overrides = {
  fr: {
    reasonTitle: "POURQUOI {lang} ?",
    reasonSubtitle: "Il n'y a pas de mauvaises réponses — c'est juste pour célébrer avec toi les moments qui comptent.",
    reasonContinue: "CONTINUER",
    reasonOptionTravel: "Voyage",
    reasonOptionPerson: "Quelqu'un dans ma vie",
    reasonOptionCareer: "Travail ou études",
    reasonOptionHeritage: "Origines",
    reasonOptionCulture: "Livres, films & musique",
    reasonOptionFun: "Juste pour le plaisir",
    reasonDetailTravel: "Où vas-tu ?",
    reasonDetailPerson: "De qui s'agit-il ?",
    reasonDetailCareer: "Quel est l'objectif ?",
    reasonDetailHeritage: "Quel est le lien ?",
    reasonDetailCulture: "Qu'est-ce qui t'attire ?",
    reasonDetailPlaceholderTravel: "ex. Lisbonne",
    reasonDetailPlaceholderPerson: "ex. mon partenaire",
    reasonDetailPlaceholderCareer: "ex. un client à Madrid",
    reasonDetailPlaceholderHeritage: "ex. ma famille est norvégienne",
    reasonDetailPlaceholderCulture: "ex. Studio Ghibli",
    reasonDetailHint: "Optionnel — tu peux passer.",
    roadmapTitle: "TON VOYAGE",
    roadmapCounter: "{done} sur {total} étapes complétées",
    roadmapCounterFull: "{done} complété · {inprogress} en cours · {ahead} à venir",
    roadmapSessionFinished: "Session {n} terminée. Encore une étape derrière toi.",
    roadmapBegin: "COMMENCE TON VOYAGE",
    roadmapBack: "← RETOUR",
    journeyBtn: "VOYAGE",
    milestoneHeadline: "{n} MOTS",
    milestoneGeneric: "Chacun d'eux — à toi.",
    milestoneReasonTravel: "{detail} se rapproche à chaque mot.",
    milestoneReasonPerson: "{detail} se rapproche à chaque mot.",
    milestoneReasonCareer: "Un pas de plus vers {detail}.",
    milestoneReasonHeritage: "{detail} vit dans ces mots.",
    milestoneReasonCulture: "{detail}, dans sa propre voix.",
    milestoneReasonFun: "Et tu ne fais que commencer."
  },
  zh: {
    reasonTitle: "为什么学{lang}？",
    reasonSubtitle: "没有错误答案——这只是帮助我们一起庆祝对你重要的时刻。",
    reasonContinue: "继续",
    reasonOptionTravel: "旅行",
    reasonOptionPerson: "生命中的某个人",
    reasonOptionCareer: "工作或学习",
    reasonOptionHeritage: "家族渊源",
    reasonOptionCulture: "书籍、电影和音乐",
    reasonOptionFun: "只是为了乐趣",
    reasonDetailTravel: "你要去哪里？",
    reasonDetailPerson: "是谁？",
    reasonDetailCareer: "目标是什么？",
    reasonDetailHeritage: "有什么联系？",
    reasonDetailCulture: "什么吸引了你？",
    reasonDetailPlaceholderTravel: "例如：里斯本",
    reasonDetailPlaceholderPerson: "例如：我的伴侣",
    reasonDetailPlaceholderCareer: "例如：马德里的客户",
    reasonDetailPlaceholderHeritage: "例如：我的家人来自挪威",
    reasonDetailPlaceholderCulture: "例如：吉卜力工作室",
    reasonDetailHint: "可选——跳过也没问题。",
    roadmapTitle: "你的旅程",
    roadmapCounter: "共{total}站，已完成{done}站",
    roadmapCounterFull: "{done} 已完成 · {inprogress} 进行中 · {ahead} 待开始",
    roadmapSessionFinished: "第{n}课完成。又一站留在身后。",
    roadmapBegin: "开始你的旅程",
    roadmapBack: "← 返回",
    journeyBtn: "旅程",
    milestoneHeadline: "{n} 个单词",
    milestoneGeneric: "每一个——都是你的。",
    milestoneReasonTravel: "每学一个词，{detail}就更近一步。",
    milestoneReasonPerson: "每学一个词，与{detail}的距离就更近。",
    milestoneReasonCareer: "向{detail}又迈进一步。",
    milestoneReasonHeritage: "{detail}活在这些词语中。",
    milestoneReasonCulture: "{detail}，用它原本的声音。",
    milestoneReasonFun: "你才刚刚开始。"
  }
};

// Surgically insert missing keys into a language file without reformatting
// its existing structure. Each file has its own layout: some use compact
// one-line entries, others multi-line. We detect the closing brace of the
// uiStrings block and splice new entries just before it.
function addMissingKeys(langCode, keyMap) {
  const filePath = path.join(ROOT, 'lang', `${langCode}.json`);
  let raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const existing = new Set(Object.keys(data.uiStrings || {}));
  const toAdd = Object.keys(keyMap).filter(k => !existing.has(k));
  if (!toAdd.length) return { code: langCode, added: 0 };

  // Locate the end of the uiStrings object (first top-level `}` that closes
  // the "uiStrings": { … } block).
  const startIdx = raw.indexOf('"uiStrings": {');
  if (startIdx < 0) throw new Error(`no uiStrings block in ${langCode}`);
  const openIdx = raw.indexOf('{', startIdx);
  let depth = 0, closeIdx = -1;
  for (let i = openIdx; i < raw.length; i++) {
    const c = raw[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx < 0) throw new Error(`malformed uiStrings in ${langCode}`);

  // Find the character just before the closing brace (skipping whitespace);
  // decide whether to prepend a comma.
  let lookback = closeIdx - 1;
  while (lookback > openIdx && /\s/.test(raw[lookback])) lookback--;
  const needsLeadingComma = (raw[lookback] !== ',' && raw[lookback] !== '{');

  const indent = '    ';
  const entries = toAdd
    .map(k => `${indent}"${k}": ${JSON.stringify(keyMap[k])}`)
    .join(',\n');

  const prefix = raw.slice(0, lookback + 1);
  const suffix = raw.slice(lookback + 1);
  const glue = needsLeadingComma ? ',\n' : '\n';
  const patched = prefix + glue + entries + '\n  ' + suffix.trimStart();

  // Verify the result parses before committing to disk.
  JSON.parse(patched);
  fs.writeFileSync(filePath, patched);
  return { code: langCode, added: toAdd.length };
}

console.log('Adding missing i18n strings…');
for (const [code, keyMap] of Object.entries(translations)) {
  const result = addMissingKeys(code, keyMap);
  console.log(`  ${result.code}: +${result.added}`);
}

// Replace any English-placeholder values that were seeded by an earlier
// batch (fr/zh had English placeholders for the reason/roadmap/milestone
// keys; those need real translations now).
function overrideEnglishPlaceholders(langCode, keyMap) {
  const filePath = path.join(ROOT, 'lang', `${langCode}.json`);
  const enPath = path.join(ROOT, 'lang', 'en.json');
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  let raw = fs.readFileSync(filePath, 'utf8');
  let replaced = 0;
  for (const [key, newVal] of Object.entries(keyMap)) {
    const enVal = en.uiStrings[key];
    if (enVal === undefined) continue;
    // Match the exact English value currently in the file for this key.
    const pattern = new RegExp(
      `("${key}":\\s*)${JSON.stringify(enVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    );
    const next = raw.replace(pattern, (_m, p1) => p1 + JSON.stringify(newVal));
    if (next !== raw) { raw = next; replaced++; }
  }
  JSON.parse(raw);
  fs.writeFileSync(filePath, raw);
  return replaced;
}

console.log('\nReplacing English placeholders…');
for (const [code, keyMap] of Object.entries(overrides)) {
  const n = overrideEnglishPlaceholders(code, keyMap);
  console.log(`  ${code}: ${n} replaced`);
}
console.log('Done.');
