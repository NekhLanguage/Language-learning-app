// tutor_opinions.mjs — the "Opinions" subject in Anna's topic picker (beta).
//
// A built-in topic that rolls a discussion theme every time it is picked:
// B1-style "say what you think and why" questions (phones in school, city
// or countryside, working from home …). The themes are the app's own;
// Anna gets the English brief and runs an ordinary conversation in the
// target language — short exchanges, not a monologue test.
//
// Progress lives on the session records (USER.tutor.memory[lang].sessions):
// a record played under a theme carries `themeId`, and Anna's end-of-session
// record adds `themeNote`, a short progress note. The next time the same
// theme comes up she gets those notes and is told to compare. Themes are
// rolled fewest-played first, so a learner meets all of them before any
// repeats — and the repeat is where the comparison happens.
//
// The topic itself is an ordinary row in USER.tutor.topics (so sessions
// file under it and Anna keeps running notes on it like any topic), marked
// `kind: "opinions"` so the picker renders it as the roller. Pure functions,
// shared by tutor.js and the unit tests.

import { createTopic, getTopics } from "./tutor_topics.mjs";

export const OPINIONS_TOPIC_NAME = "Opinions";
export const OPINIONS_KIND = "opinions";
// Previous notes on the same theme sent with each request.
export const THEME_SESSIONS_IN_PROMPT = 3;
export const OPINIONS_LAST_KEY = "zth_tutor_opinion_last";

// id — uiStrings key for the translated label — English label — Anna's brief.
export const OPINION_THEMES = [
  { id: "social_media", key: "opinionThemeSocialMedia", en: "Time spent on social media", brief: "Is it good that so many people spend hours on social media? Why or why not?" },
  { id: "time_vs_money", key: "opinionThemeTimeVsMoney", en: "Free time or money", brief: "Which matters more: plenty of free time, or earning a lot? Why?" },
  { id: "phones_school", key: "opinionThemePhonesSchool", en: "Phones in school", brief: "Should children be allowed to use phones at school? Why or why not?" },
  { id: "big_city", key: "opinionThemeBigCity", en: "Living in a big city", brief: "What is good, and what is bad, about living in a big city?" },
  { id: "other_cultures", key: "opinionThemeOtherCultures", en: "Learning about other cultures", brief: "Is it important to learn about other countries' cultures? Why?" },
  { id: "learning_language", key: "opinionThemeLearningLanguage", en: "The best way to learn a language", brief: "What is the best way to learn the language you are studying? Why does it work?" },
  { id: "travel_environment", key: "opinionThemeTravelEnvironment", en: "Travelling less for the climate", brief: "Should people travel less to protect the environment? Why or why not?" },
  { id: "working_home", key: "opinionThemeWorkingHome", en: "Working from home", brief: "What is good, and what is bad, about working from home?" },
  { id: "exercise", key: "opinionThemeExercise", en: "Exercise for everyone", brief: "Should everyone do some kind of sport or exercise? Why?" },
  { id: "good_life", key: "opinionThemeGoodLife", en: "What makes a good life", brief: "What matters most for a good, happy life? Why that?" },
  { id: "homework", key: "opinionThemeHomework", en: "Homework for children", brief: "Should children have homework? Why or why not?" },
  { id: "neighbours", key: "opinionThemeNeighbours", en: "Knowing your neighbours", brief: "Is it important to know your neighbours? Why or why not?" },
  { id: "owning_car", key: "opinionThemeOwningCar", en: "Owning a car", brief: "What is good, and what is bad, about owning a car?" },
  { id: "family_dinner", key: "opinionThemeFamilyDinner", en: "Dinner with the family", brief: "Is it important to eat dinner together as a family? Why or why not?" },
  { id: "good_workplace", key: "opinionThemeGoodWorkplace", en: "A good place to work", brief: "What makes people happy at work? Why those things?" },
  { id: "city_country", key: "opinionThemeCityCountry", en: "City or countryside", brief: "Is it better to live in the city or in the countryside? Why?" },
  { id: "screen_time", key: "opinionThemeScreenTime", en: "Children and screens", brief: "Do children and teenagers spend too much time on screens? Why or why not?" },
  { id: "choosing_career", key: "opinionThemeChoosingCareer", en: "Choosing a job or an education", brief: "What matters most when choosing an education or a job? Why?" },
  { id: "family_contact", key: "opinionThemeFamilyContact", en: "Staying close to family", brief: "Is it important to stay in close contact with your family? Why or why not?" },
];

export function themeById(id) {
  return OPINION_THEMES.find((t) => t.id === id) || null;
}

// The label in the learner's support language, English when the lang
// file has no entry yet.
export function themeLabel(theme, uiStrings) {
  return (uiStrings && typeof uiStrings[theme.key] === "string" && uiStrings[theme.key].trim()) || theme.en;
}

export function findOpinionsTopic(user) {
  const topics = getTopics(user);
  return topics.find((t) => t.kind === OPINIONS_KIND) || null;
}

// The Opinions topic, created on first use. Reuses a topic the learner
// named "Opinions" themselves (createTopic dedupes by name) and marks it.
// Returns null only when the topic list is full.
export function ensureOpinionsTopic(user, when = "") {
  const existing = findOpinionsTopic(user);
  if (existing) return existing;
  const topic = createTopic(user, OPINIONS_TOPIC_NAME, { when });
  if (topic) topic.kind = OPINIONS_KIND;
  return topic;
}

// Session records played under a theme, most recent first (the records
// are stored newest first already; keep their order).
export function themeSessions(sessions, themeId) {
  if (!themeId) return [];
  return (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.themeId === themeId);
}

// Map theme id -> number of sessions, for every theme (0 when none).
export function themeCounts(sessions) {
  const counts = new Map(OPINION_THEMES.map((t) => [t.id, 0]));
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (s && counts.has(s.themeId)) counts.set(s.themeId, counts.get(s.themeId) + 1);
  }
  return counts;
}

// What the picker row shows: themes met so far and conversations played.
export function themeProgress(sessions) {
  const counts = themeCounts(sessions);
  let done = 0;
  let conversations = 0;
  for (const n of counts.values()) {
    if (n > 0) done += 1;
    conversations += n;
  }
  return { done, total: OPINION_THEMES.length, conversations };
}

// Rolls the next theme: uniformly among the themes with the fewest
// sessions in this language, so every theme is met before any repeats.
// `lastId` (the theme just played on this device) is skipped when there
// is any other candidate at the same count — it can only win when it is
// the one theme a whole round behind.
export function rollOpinionTheme(sessions, { lastId = null, rng = Math.random } = {}) {
  const counts = themeCounts(sessions);
  const min = Math.min(...counts.values());
  let candidates = OPINION_THEMES.filter((t) => counts.get(t.id) === min);
  if (candidates.length > 1 && lastId) candidates = candidates.filter((t) => t.id !== lastId);
  const idx = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
  return candidates[idx];
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// The theme's lines for the CONVERSATION TOPICS block: the brief, how many
// times the learner has had it, and Anna's notes from those sessions. The
// server adds the rule that goes with them (see renderTopicsBlock).
export function renderThemeText(theme, sessions) {
  if (!theme) return "";
  const previous = themeSessions(sessions, theme.id).slice(0, THEME_SESSIONS_IN_PROMPT);
  const total = themeSessions(sessions, theme.id).length;
  const lines = [
    `THIS CONVERSATION'S BRIEF: ${theme.brief}`,
    `Times on this theme: this is the learner's ${ordinal(total + 1)} conversation on it${total ? "" : " — a new theme for them"}.`,
  ];
  if (previous.length) {
    lines.push("PREVIOUS CONVERSATIONS ON THIS THEME (most recent first):");
    for (const s of previous) lines.push(`- ${s.when || "?"}: ${s.themeNote || s.sessionSummary || ""}`);
  }
  return lines.join("\n");
}

// The learner-facing line when a theme is picked.
export function themePickLine(label, sessions, themeId) {
  const previous = themeSessions(sessions, themeId);
  if (!previous.length) return `Theme: ${label} — new theme. Anna asks what you think and why; say hi to start.`;
  const last = previous[0]?.when || "earlier";
  return `Theme: ${label} — your ${ordinal(previous.length + 1)} time (last ${last}). Anna compares with last time; say hi to start.`;
}
