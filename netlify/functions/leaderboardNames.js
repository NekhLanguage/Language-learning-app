// Leaderboard handles (Nekh 2026-10-25): a new account joins the board
// under a generated name — a positive adjective and an animal, "Brave
// Otter" — never its Google name or email. One tap renames it, one tap
// leaves. Words are plain English for now (user data on the board, like
// any name a learner picks); every combination fits the 2–24 character
// rule and needs no characters normalizeDisplayName refuses.

const ADJECTIVES = [
  "Brave", "Bright", "Calm", "Cheerful", "Clever", "Curious", "Daring", "Eager",
  "Friendly", "Gentle", "Glad", "Golden", "Happy", "Helpful", "Hopeful", "Jolly",
  "Kind", "Lively", "Lucky", "Merry", "Mighty", "Noble", "Patient", "Plucky",
  "Proud", "Quick", "Radiant", "Sharp", "Smart", "Steady", "Sunny", "Swift",
  "Bold", "Tireless", "Upbeat", "Valiant", "Warm", "Wise", "Witty", "Zesty",
];

const ANIMALS = [
  "Badger", "Bear", "Beaver", "Bison", "Cat", "Crane", "Deer", "Dolphin",
  "Eagle", "Falcon", "Fox", "Gecko", "Hare", "Hawk", "Hedgehog", "Heron",
  "Koala", "Lark", "Lion", "Lynx", "Moose", "Otter", "Owl", "Panda",
  "Parrot", "Penguin", "Puffin", "Rabbit", "Raven", "Robin", "Seal", "Sparrow",
  "Squirrel", "Swan", "Tiger", "Turtle", "Walrus", "Whale", "Wolf", "Yak",
];

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

// "Adjective Animal", or with a number on later attempts ("Swift Owl 42")
// so a crowded board still finds a free name quickly.
function randomHandle(attempt = 0, rng = Math.random) {
  const base = `${pick(ADJECTIVES, rng)} ${pick(ANIMALS, rng)}`;
  if (attempt < 3) return base;
  return `${base} ${10 + Math.floor(rng() * 90)}`;
}

module.exports = { ADJECTIVES, ANIMALS, randomHandle };
