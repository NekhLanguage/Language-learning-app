// Practice rounds only use sentences that make sense (Nekh 2026-10-21):
// "She sees their eye" (someone else's body part), "You defeat your trainer"
// (a possessive on the one you defeat) and "I am a wrong wizard" (an
// adjective on a noun it doesn't fit) must never be chosen.

import { test, expect, startNewRun, seedAllConceptsAt } from "./fixtures.mjs";

const OWN_SUBJECT = { MY: "FIRST_PERSON_SINGULAR", YOUR: "SECOND_PERSON", HIS: "HE", HER: "SHE", OUR: "FIRST_PERSON_PLURAL", THEIR: "THIRD_PERSON_PLURAL" };

test("drills never pick someone else's body part, a possessive on DEFEAT, or an unfitting adjective", async ({ page }) => {
  await startNewRun(page, { packIds: ["pokemon", "everyday_life"] });
  await seedAllConceptsAt(page, 5, { bundles: 40 });
  const bad = await page.evaluate((own) => {
    const V = window.GLOBAL_VOCAB.concepts;
    const out = [];
    for (const poss of Object.keys(own)) {
      for (let i = 0; i < 60; i++) {
        const tpl = window.__app.chooseTemplate(poss);
        if (!tpl) break;
        const c = tpl.concepts;
        if (c.includes("DEFEAT")) out.push(`${poss} on ${tpl.template_id}`);
        const bodyPart = c.some((x) => V[x]?.type === "noun" && (V[x].category === "body_part" || V[x].semantic_role === "body_part"));
        if (bodyPart && !c.includes("BE") && !c.includes(own[poss])) out.push(`${poss} on ${tpl.template_id}`);
      }
    }
    for (const adj of ["WRONG", "CORRECT", "YOUNG", "SHINY", "LEGENDARY"]) {
      for (let i = 0; i < 40; i++) {
        const tpl = window.__app.chooseTemplate(adj);
        if (!tpl) break;
        if (tpl.concepts.includes(adj)) continue; // its own sentence
        const nouns = tpl.concepts.filter((x) => V[x]?.type === "noun");
        const fits = V[adj].fits || [];
        const fitsNouns = V[adj].fitsNouns || [];
        if (!nouns.some((n) => fits.includes(V[n].category) || fitsNouns.includes(n))) out.push(`${adj} on ${tpl.template_id}`);
      }
    }
    return [...new Set(out)];
  }, OWN_SUBJECT);
  expect(bad).toEqual([]);
});
