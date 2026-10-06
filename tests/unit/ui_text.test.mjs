import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeTranslator, gateLanguage, rememberSupportLanguage, markGatePick, takeGatePick,
  SUPPORT_LANG_KEY, GATE_LANG_PICK_KEY,
} from "../../ui_text.mjs";

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("translator: support language, then English, then the inline fallback", () => {
  const t = makeTranslator({ a: "A-de" }, { a: "A-en", b: "B-en" });
  assert.equal(t("a", "x"), "A-de");
  assert.equal(t("b", "x"), "B-en");
  assert.equal(t("c", "x"), "x");
  assert.equal(t("c"), "c");
});

test("translator fills {placeholders} and leaves unknown ones", () => {
  const t = makeTranslator({ s: "Für {email} ({n})" }, {});
  assert.equal(t("s", "", { email: "a@b.c" }), "Für a@b.c ({n})");
});

test("gate language: remembered pick, else the stored account language, else English — never the browser", () => {
  const codes = ["en", "de", "pt"];
  assert.equal(gateLanguage(codes, memoryStorage()), "en");
  assert.equal(gateLanguage(codes, memoryStorage(), "pt"), "pt");
  assert.equal(gateLanguage(codes, memoryStorage({ [SUPPORT_LANG_KEY]: "de" }), "pt"), "de");
  // A remembered code that is no longer offered falls through.
  assert.equal(gateLanguage(codes, memoryStorage({ [SUPPORT_LANG_KEY]: "xx" })), "en");
});

test("rememberSupportLanguage writes the device key", () => {
  const s = memoryStorage();
  rememberSupportLanguage("de", s);
  assert.equal(s.getItem(SUPPORT_LANG_KEY), "de");
});

test("a gate pick is taken once, and only when it is a valid code", () => {
  const s = memoryStorage();
  markGatePick("pt", s);
  assert.equal(takeGatePick(["en", "pt"], s), "pt");
  assert.equal(takeGatePick(["en", "pt"], s), null);
  markGatePick("xx", s);
  assert.equal(takeGatePick(["en", "pt"], s), null);
  assert.equal(s.getItem(GATE_LANG_PICK_KEY), null);
});

test("storage that throws (private mode) never breaks the gate", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(gateLanguage(["en"], broken), "en");
  rememberSupportLanguage("de", broken);
  markGatePick("de", broken);
  assert.equal(takeGatePick(["de"], broken), null);
});
