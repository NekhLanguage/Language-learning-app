// On-device semantic grading (L7): when the strict match fails, a mocked
// Chrome Prompt API may accept a semantically-correct variation — but only
// for capability-gated target languages, and never without the API.

import { test, expect, startNewRun, seedAllConceptsAt } from "./fixtures.mjs";

const ACCEPTING_MODEL = () => {
  window.LanguageModel = {
    create: async () => ({
      prompt: async () =>
        '{"acceptable": true, "feedback": "Different wording, same meaning."}',
      destroy: () => {},
    }),
  };
};

test("a semantically-correct variation is accepted for a gated language (es)", async ({ page }) => {
  await page.addInitScript(ACCEPTING_MODEL);
  await startNewRun(page, { language: "Spanish" });
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#l7-input")).toBeVisible();
  await page.fill("#l7-input", "una variación con el mismo sentido");
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Different wording");
  const state = await page.evaluate(() => ({
    resultType: window.__app.lastExercise.lastResultType,
    lastResult: window.__app.run.progress[window.__app.run.lastTargetConcept].lastResult,
  }));
  expect(state.resultType).toBe("semantic");
  expect(state.lastResult).toBe(true);
});

test("the same model is ignored for a non-gated language (pt)", async ({ page }) => {
  await page.addInitScript(ACCEPTING_MODEL);
  await startNewRun(page); // Portuguese — not in the semantic_grading gate
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await page.fill("#l7-input", "uma variação com o mesmo sentido");
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Incorrect");
  const resultType = await page.evaluate(() => window.__app.lastExercise.lastResultType);
  expect(resultType).toBe("incorrect");
});

test("without the API, wrong answers stay incorrect (fallback)", async ({ page }) => {
  await startNewRun(page, { language: "Spanish" });
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await page.fill("#l7-input", "respuesta equivocada");
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Incorrect");
});
