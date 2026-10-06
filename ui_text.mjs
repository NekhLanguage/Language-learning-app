// UI text for the pages that render before the app shell has a learner:
// the sign-in gate (app.js) and the set-password page (auth.html).
//
// The rule (Nekh 2026-10-06): every screen speaks the learner's support
// language — never a guess from the browser. Before sign-in the only
// source is the learner's own pick on the gate, remembered on this device
// under SUPPORT_LANG_KEY. That key is a display preference, not account
// data, so logout keeps it (a returning learner sees their language at the
// gate) and the account's own supportLanguage still lives in the USER blob.

export const SUPPORT_LANG_KEY = "zth_support_lang";
// Set only when the learner changes the picker ON the gate. The sign-in
// that follows (password, or Google after its round trip) copies that pick
// onto the account, then clears this flag.
export const GATE_LANG_PICK_KEY = "zth_gate_lang_pick";

// t(key, fallback, vars): the support-language string, else English, else
// the inline fallback. {name} placeholders are filled from vars.
export function makeTranslator(primary, english) {
  return (key, fallback = key, vars = null) => {
    let s = primary?.[key] ?? english?.[key] ?? fallback;
    s = String(s);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  };
}

function safeGet(store, key) {
  try { return store.getItem(key); } catch (_) { return null; }
}
function safeSet(store, key, value) {
  try { store.setItem(key, value); } catch (_) { /* private mode: the pick lasts this page only */ }
}
function safeRemove(store, key) {
  try { store.removeItem(key); } catch (_) { /* fine */ }
}

// The language the gate should open in: this device's remembered pick, else
// the account language a stored USER blob still carries, else English.
export function gateLanguage(validCodes, storage = globalThis.localStorage, userSupport = null) {
  const valid = new Set(validCodes);
  const remembered = storage ? safeGet(storage, SUPPORT_LANG_KEY) : null;
  if (remembered && valid.has(remembered)) return remembered;
  if (userSupport && valid.has(userSupport)) return userSupport;
  return "en";
}

export function rememberSupportLanguage(code, storage = globalThis.localStorage) {
  if (storage && code) safeSet(storage, SUPPORT_LANG_KEY, code);
}

export function markGatePick(code, storage = globalThis.sessionStorage) {
  if (storage && code) safeSet(storage, GATE_LANG_PICK_KEY, code);
}

// Returns the gate pick (once) and clears it.
export function takeGatePick(validCodes, storage = globalThis.sessionStorage) {
  if (!storage) return null;
  const code = safeGet(storage, GATE_LANG_PICK_KEY);
  safeRemove(storage, GATE_LANG_PICK_KEY);
  return code && validCodes.includes(code) ? code : null;
}
