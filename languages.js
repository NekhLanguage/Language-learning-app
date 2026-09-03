// VERSION: v1.0.0
// beta: true = not yet owner-verified. Verified: Portuguese, Norwegian, English,
// French and Japanese (Nekh 2026-09-03, on Emi's 19/19 reads of both).
// hidden: true = registered for every validator (the language gate, coverage
//   matrix, divergence ratchet, …) but invisible to learners in both the
//   target and support pickers. This is the "being built" state a new
//   language lives in until validate-language-gate passes for it. NOTE: keep
//   `code` as the FIRST key in every row — the validators discover shipped
//   languages by scanning this file's text for rows whose first key is the
//   code (and that scan also reads comments, so never write a row-shaped
//   literal in one). A unit test pins that the scan matches the export.
// ttsCode: the browser BCP-47 tag — it drives BOTH cloud TTS request URLs
//   AND Web Speech recognition (app.js recognizeOnce), so it must stay a
//   browser-valid tag. Google Cloud TTS wants different codes for Arabic
//   (ar-XA) and Mandarin (cmn-CN); those aliases live in
//   netlify/functions/tts.js, the only place that talks to Google.
// Registry sorted alphabetically by English label.
export const AVAILABLE_LANGUAGES = [
  { code: "ar", label: "Arabic",     nativeLabel: "العربية",     short: "AR", ttsCode: "ar-SA", isRTL: true,  beta: true  },
  { code: "en", label: "English",    nativeLabel: "English",     short: "EN", ttsCode: "en-US", isRTL: false, beta: false },
  { code: "fi", label: "Finnish",    nativeLabel: "Suomi",       short: "FI", ttsCode: "fi-FI", isRTL: false, beta: true, hidden: true },
  { code: "fr", label: "French",     nativeLabel: "Français",    short: "FR", ttsCode: "fr-FR", isRTL: false, beta: false },
  { code: "de", label: "German",     nativeLabel: "Deutsch",     short: "DE", ttsCode: "de-DE", isRTL: false, beta: true  },
  { code: "el", label: "Greek",      nativeLabel: "Ελληνικά",    short: "EL", ttsCode: "el-GR", isRTL: false, beta: true  },
  { code: "it", label: "Italian",    nativeLabel: "Italiano",    short: "IT", ttsCode: "it-IT", isRTL: false, beta: true  },
  { code: "ja", label: "Japanese",   nativeLabel: "日本語",       short: "JA", ttsCode: "ja-JP", isRTL: false, beta: false },
  { code: "ko", label: "Korean",     nativeLabel: "한국어",        short: "KO", ttsCode: "ko-KR", isRTL: false, beta: true  },
  { code: "zh", label: "Mandarin",   nativeLabel: "中文",         short: "ZH", ttsCode: "zh-CN", isRTL: false, beta: true  },
  { code: "no", label: "Norwegian",  nativeLabel: "Norsk",       short: "NO", ttsCode: "nb-NO", isRTL: false, beta: false },
  { code: "pl", label: "Polish",     nativeLabel: "Polski",      short: "PL", ttsCode: "pl-PL", isRTL: false, beta: true  },
  { code: "pt", label: "Portuguese", nativeLabel: "Português",   short: "PT", ttsCode: "pt-BR", isRTL: false, beta: false },
  { code: "es", label: "Spanish",    nativeLabel: "Español",     short: "ES", ttsCode: "es-ES", isRTL: false, beta: true  },
  { code: "th", label: "Thai",       nativeLabel: "ไทย",         short: "TH", ttsCode: "th-TH", isRTL: false, beta: true  },
  { code: "tr", label: "Turkish",    nativeLabel: "Türkçe",      short: "TR", ttsCode: "tr-TR", isRTL: false, beta: true  },
  { code: "uk", label: "Ukrainian",  nativeLabel: "Українська",  short: "UK", ttsCode: "uk-UA", isRTL: false, beta: true  }
];
