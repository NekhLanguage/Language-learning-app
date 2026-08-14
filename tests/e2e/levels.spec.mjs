// One test per mastery-level renderer (L1 exposure … L7 free production),
// seeding the run state so the desired level renders, then answering
// correctly (and, for L2/L7, also incorrectly) and asserting the feedback
// and advance wiring.

import { test, expect, startNewRun, seedAllConceptsAt, lastTargetConcept } from "./fixtures.mjs";

function exact(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

test("L1 exposure card shows word, sentences, and advances", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 1);

  await expect(page.locator("#content h2")).toBeVisible();
  await expect(page.locator("#content hr")).toBeVisible();
  await expect(page.locator("#continue-btn")).toBeVisible();

  const firstWord = await page.locator("#content h2").innerText();
  await page.click("#continue-btn");
  await expect(page.locator("#content h2")).toBeVisible();

  const cid = await lastTargetConcept(page);
  expect(cid).toBeTruthy();
  expect(firstWord.trim()).not.toEqual("");
});

test("L2 multiple choice: correct answer marks green and advances", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  await expect(page.locator("#choices button[data-cid]")).toHaveCount(4);
  await expect(page.locator("#check-btn")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await expect(page.locator("#check-btn")).toBeEnabled();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate(
    (c) => window.__app.run.progress[c], cid
  );
  expect(progress.lastResult).toBe(true);

  // Check button becomes the advance button.
  await page.click("#check-btn");
  await expect(page.locator("#content h2, #content p").first()).toBeVisible();
});

test("L2 multiple choice: wrong answer marks red and does not level up", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 2);

  const cid = await lastTargetConcept(page);
  const wrong = page.locator(`#choices button[data-cid]:not([data-cid="${cid}"])`).first();
  await wrong.click();
  await page.click("#check-btn");

  await expect(wrong).toHaveClass(/incorrect/);
  // The correct option is revealed alongside.
  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);

  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(false);
  expect(progress.level).toBe(2);
});

test("L3 fill-in-the-blank renders tiles and accepts the right one", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 3);

  await expect(page.locator("#choices .word-bank-chip")).not.toHaveCount(0);
  await expect(page.locator("#check-btn")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L4 recognition renders target-language tiles and accepts the right one", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 4);

  await expect(page.locator("#choices .word-bank-chip")).not.toHaveCount(0);

  const cid = await lastTargetConcept(page);
  await page.locator(`#choices button[data-cid="${cid}"]`).click();
  await page.click("#check-btn");

  await expect(page.locator(`#choices button[data-cid="${cid}"]`)).toHaveClass(/correct/);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L5 matching: pairing every word with itself passes", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 5);

  await expect(page.locator("#matching-wrapper")).toBeVisible();
  const leftButtons = page.locator('#left-column button[data-cid]');
  await expect(leftButtons).toHaveCount(5);

  const cids = await leftButtons.evaluateAll((els) => els.map((el) => el.dataset.cid));
  for (const cid of cids) {
    await page.locator(`#left-column button[data-cid="${cid}"]`).click();
    await page.locator(`#right-column button[data-cid="${cid}"]`).click();
  }
  const counter = await page.evaluate(() => window.__app.run.exerciseCounter);
  await page.click("#check-matches");

  await expect(page.locator("#left-column button.matched")).toHaveCount(5);
  await expect(page.locator("#right-column button.matched")).toHaveCount(5);

  // All correct → auto-advance to the next exercise (which may be another
  // matching round, so watch the counter rather than the DOM).
  await expect
    .poll(() => page.evaluate(() => window.__app.run.exerciseCounter), { timeout: 5_000 })
    .toBeGreaterThan(counter);
});

test("L6 sentence builder: placing words in order passes", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 6, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#slot-container")).toBeVisible();
  await expect(page.locator("#word-bank")).toBeVisible();

  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
  expect(correctWords.length).toBeGreaterThan(1);

  for (let i = 0; i < correctWords.length; i++) {
    await page
      .locator("#word-bank .word-bank-chip button")
      .filter({ hasText: exact(correctWords[i]) })
      .first()
      .click();
    await page.locator(`#slot-container [data-index="${i}"]`).click();
  }
  const counter = await page.evaluate(() => window.__app.run.exerciseCounter);
  await page.click("#check-l6");

  await expect(page.locator("#slot-container .sentence-slot.correct")).toHaveCount(correctWords.length);
  // All correct → auto-advance (possibly to another builder with the same
  // element ids, so watch the counter rather than the DOM).
  await expect
    .poll(() => page.evaluate(() => window.__app.run.exerciseCounter), { timeout: 5_000 })
    .toBeGreaterThan(counter);
});

test("L7 free production: typing the exact sentence is accepted", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  await expect(page.locator("#l7-input")).toBeVisible();

  const { answer } = await page.evaluate(() => window.__app.lastExercise);
  expect(answer.trim()).not.toEqual("");

  await page.fill("#l7-input", answer);
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Correct");
  await expect(page.locator("#l7-input")).toBeDisabled();

  const cid = await lastTargetConcept(page);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(true);
});

test("L7 free production: a wrong answer reveals the correct sentence", async ({ page }) => {
  await startNewRun(page);
  await seedAllConceptsAt(page, 7, { restrictTypes: ["pronoun", "verb", "noun"] });

  const { answer } = await page.evaluate(() => window.__app.lastExercise);

  await page.fill("#l7-input", "completely wrong answer");
  await page.click("#check-l7");

  await expect(page.locator("#l7-feedback")).toContainText("Incorrect");
  await expect(page.locator("#l7-feedback strong")).toContainText(answer);

  const cid = await lastTargetConcept(page);
  const progress = await page.evaluate((c) => window.__app.run.progress[c], cid);
  expect(progress.lastResult).toBe(false);
});

test("L6 with a drilled adjective shows it in prompt and tiles together", async ({ page }) => {
  // Regression net for the "They read a red book." screenshot: the prompt
  // promised an adjective no tile could supply. Whenever the drilled
  // modifier appears in the support prompt it must be buildable from the
  // tile bank, and vice versa.
  await startNewRun(page);
  await seedAllConceptsAt(page, 6, { restrictTypes: ["adjective"] });

  await expect(page.locator("#slot-container")).toBeVisible();

  const cid = await lastTargetConcept(page);
  const forms = await page.evaluate((c) => {
    const f = (lang) => {
      const e = window.GLOBAL_VOCAB.languages[lang]?.forms?.[c];
      if (Array.isArray(e)) return e[0];
      return e?.form || (typeof e === "string" ? e : "");
    };
    // startNewRun always begins a Portuguese course (fixtures.mjs default).
    return { en: f("en"), target: f("pt") };
  }, cid);

  const prompt = (await page.locator("#content strong").first().innerText()).toLowerCase();
  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
  const tiles = correctWords.join(" ").toLowerCase();

  // Gendered agreement can shift the final vowel («червоний» → «червону»,
  // "motivado" → "motivada") — compare on the stem.
  const stem = (w) => w.toLowerCase().slice(0, Math.max(3, w.length - 1));
  const promptHasIt = prompt.includes(forms.en.toLowerCase());
  const tilesHaveIt = tiles.includes(stem(forms.target));
  expect(promptHasIt).toBe(tilesHaveIt);
});

// Ukrainian (rather than Portuguese) exercises the engine paths that can
// legitimately drop a modifier — oblique case «до залу», authored adverbials
// «додому». Gender/case agreement can rewrite the ending well before the
// last letter («новий» → «нову»), so compare on a short shared prefix.
const sharesStem = (tile, form) => {
  const a = tile.toLowerCase();
  const b = form.toLowerCase();
  const n = Math.min(3, b.length);
  return a.slice(0, n) === b.slice(0, n);
};

test("uk L6: a drilled adjective in the prompt is its own placeable tile", async ({ page }) => {
  // Regression net for the "They have red clothes." / «вони|мають|одяг»
  // screenshots: the en prompt promised an adjective the uk tile bank could
  // not supply. L6 now bails when the target render can't express the
  // drilled modifier, and when it can, the adjective is a separate tile.
  await startNewRun(page, { language: "Ukrainian" });
  await seedAllConceptsAt(page, 6, { restrictTypes: ["adjective"] });

  await expect(page.locator("#slot-container")).toBeVisible();

  const cid = await lastTargetConcept(page);
  const forms = await page.evaluate((c) => {
    const f = (lang) => {
      const e = window.GLOBAL_VOCAB.languages[lang]?.forms?.[c];
      if (Array.isArray(e)) return e[0];
      return e?.form || (typeof e === "string" ? e : "");
    };
    return { en: f("en"), target: f("uk") };
  }, cid);

  const prompt = (await page.locator("#content strong").first().innerText()).toLowerCase();
  const { correctWords } = await page.evaluate(() => window.__app.lastExercise);

  const promptHasIt = prompt.includes(forms.en.toLowerCase());
  const ownTile = correctWords.some((w) => sharesStem(w, forms.target));
  // The contract both ways: an adjective the prompt demands is buildable as
  // its own tile, and no phantom adjective appears in the tiles either.
  expect(promptHasIt).toBe(ownTile);
});

test("uk L7: a drilled adjective in the prompt appears in the graded answer", async ({ page }) => {
  // Same contract for free production: the learner types what the prompt
  // says, so a support sentence with "red" whose expected answer lacks
  // «червон…» would mark every faithful translation wrong.
  await startNewRun(page, { language: "Ukrainian" });
  await seedAllConceptsAt(page, 7, { restrictTypes: ["adjective"] });

  await expect(page.locator("#l7-input")).toBeVisible();

  const cid = await lastTargetConcept(page);
  const forms = await page.evaluate((c) => {
    const f = (lang) => {
      const e = window.GLOBAL_VOCAB.languages[lang]?.forms?.[c];
      if (Array.isArray(e)) return e[0];
      return e?.form || (typeof e === "string" ? e : "");
    };
    return { en: f("en"), target: f("uk") };
  }, cid);

  const prompt = (await page.locator("#content strong").first().innerText()).toLowerCase();
  const { answer } = await page.evaluate(() => window.__app.lastExercise);

  const promptHasIt = prompt.includes(forms.en.toLowerCase());
  const answerHasIt = answer.toLowerCase().split(/\s+/)
    .some((w) => sharesStem(w, forms.target));
  expect(promptHasIt).toBe(answerHasIt);
});

test("a concept added to an already-released bundle is backfilled", async ({ page }) => {
  // Release plans are frozen at signup; when a concept joins an existing
  // bundle's definition (TABLE → core_28), backfillReleasedBundles releases
  // it for runs already past that bundle. Idempotent on a second pass.
  await startNewRun(page);
  const result = await page.evaluate(() => {
    const app = window.__app;
    const run = app.run;
    run.releasedBundleIds = ["core_28"];
    run.released = ["BEHIND", "IN", "ON", "OFF", "BETWEEN"];
    const changed = app.backfillReleasedBundles(run);
    const again = app.backfillReleasedBundles(run);
    return { changed, again, hasTable: run.released.includes("TABLE") };
  });
  expect(result.changed).toBe(true);
  expect(result.hasTable).toBe(true);
  expect(result.again).toBe(false);
});
