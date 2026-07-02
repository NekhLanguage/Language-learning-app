// diagnose-progression.mjs
// Plays the real app (headless, against the offline dev server) as a perfect
// learner — always answering correctly — until the run is exhausted or the
// budget runs out, then reports where progression stalls: level histogram,
// exercise counts per level, and which concepts are stuck untestable.
//
// Usage:
//   node scripts/diagnose-progression.mjs                 # everyday_life pack
//   node scripts/diagnose-progression.mjs --pack fitness
//   node scripts/diagnose-progression.mjs --max-exercises 3000 --max-sessions 120

import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const PACK = arg("pack", "everyday_life");
const MAX_EXERCISES = Number(arg("max-exercises", 2500));
const MAX_SESSIONS = Number(arg("max-sessions", 100));
const PORT = 8901;

// --- boot dev server ---
const server = spawn("node", ["tests/dev-server.mjs"], {
  env: { ...process.env, PORT: String(PORT), DEV_SERVER_QUIET: "1" },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const executablePath =
  process.env.PW_CHROMIUM_PATH ||
  (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
page.setDefaultTimeout(8000);

const stats = {
  exercises: 0,
  sessions: 0,
  byLevel: {},
  runExhausted: false,
  stoppedBecause: null,
};

try {
  // --- setup: login → pt → reason → pack → roadmap → learning ---
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.fill("#email-input", `diagnose-${Date.now()}@example.com`);
  await page.click("#login-btn");
  await page.waitForSelector("#start-screen.active");
  await page.click("#open-app");
  await page.locator("#language-buttons button", { hasText: "Portuguese" }).click();
  await page.waitForSelector("#reason-screen.active");
  await page.locator("#reason-buttons button").first().click();
  await page.click("#reason-continue");
  await page.locator(`#pack-buttons button[data-pack="${PACK}"]`).click();
  await page.click("#start-run");
  await page.waitForSelector("#roadmap-screen.active");
  await page.click("#roadmap-continue");

  // --- perfect-learner loop ---
  const counter = () => page.evaluate(() => window.__app.run.exerciseCounter);
  const waitAdvance = async (prev) => {
    await page.waitForFunction(
      (p) =>
        window.__app.run.exerciseCounter !== p ||
        document.querySelector("#roadmap-screen.active") ||
        document.querySelector("#run-complete-screen.active"),
      prev
    );
  };

  let consecutiveErrors = 0;
  while (stats.exercises < MAX_EXERCISES && stats.sessions < MAX_SESSIONS) {
   try {
    if (await page.locator("#run-complete-screen.active").isVisible()) {
      stats.runExhausted = true;
      stats.stoppedBecause = "run exhausted (all content completed)";
      break;
    }
    if (await page.locator("#roadmap-screen.active").isVisible()) {
      stats.sessions++;
      await page.click("#roadmap-continue", { timeout: 3000 }).catch(() => {});
      continue;
    }

    // Identify the exercise on screen.
    const kind = await page.evaluate(() => {
      if (document.querySelector("#continue-btn")) return "L1";
      if (document.querySelector("#l7-input")) return "L7";
      if (document.querySelector("#slot-container")) return "L6";
      if (document.querySelector("#matching-wrapper")) return "L5";
      if (document.querySelector("#choices")) return "CHOICE"; // L2/L3/L4
      return null;
    });
    if (!kind) {
      // Transition frame — wait for something to appear.
      await page.waitForFunction(() =>
        document.querySelector(
          "#continue-btn, #l7-input, #slot-container, #matching-wrapper, #choices, #roadmap-screen.active, #run-complete-screen.active"
        )
      );
      continue;
    }

    const levelText = await page.locator("#session-subtitle").innerText().catch(() => "");
    const level = (levelText.match(/\d+/) || ["?"])[0];
    stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
    stats.exercises++;

    const prev = await counter();

    if (kind === "L1") {
      await page.click("#continue-btn");
    } else if (kind === "CHOICE") {
      const cid = await page.evaluate(() => window.__app.run.lastTargetConcept);
      await page.locator(`#choices button[data-cid="${cid}"]`).click();
      await page.click("#check-btn");
      await page.click("#check-btn"); // relabeled Continue
    } else if (kind === "L5") {
      const cids = await page
        .locator("#left-column button[data-cid]")
        .evaluateAll((els) => els.map((el) => el.dataset.cid));
      for (const cid of cids) {
        await page.locator(`#left-column button[data-cid="${cid}"]`).click();
        await page.locator(`#right-column button[data-cid="${cid}"]`).click();
      }
      await page.click("#check-matches");
    } else if (kind === "L6") {
      const { correctWords } = await page.evaluate(() => window.__app.lastExercise);
      const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (let i = 0; i < correctWords.length; i++) {
        await page
          .locator("#word-bank .word-bank-chip button")
          .filter({ hasText: new RegExp(`^${esc(correctWords[i])}$`) })
          .first()
          .click();
        await page.locator(`#slot-container [data-index="${i}"]`).click();
      }
      await page.click("#check-l6");
    } else if (kind === "L7") {
      const { answer } = await page.evaluate(() => window.__app.lastExercise);
      await page.fill("#l7-input", answer);
      await page.click("#check-l7");
      await page.click("#check-l7"); // relabeled Continue
    }

    await waitAdvance(prev);
    consecutiveErrors = 0;
   } catch (err) {
    // Transitions (roadmap flashes, milestone overlays) can invalidate a
    // step mid-click; re-read the screen and carry on — but never spin.
    if (++consecutiveErrors > 8) {
      stats.stoppedBecause = `stuck: ${String(err.message).split("\n")[0]}`;
      break;
    }
   }
  }
  if (!stats.stoppedBecause) {
    stats.stoppedBecause =
      stats.exercises >= MAX_EXERCISES ? "exercise budget reached" : "session budget reached";
  }

  // --- final state dump (from the live run) ---
  const finalState = await page.evaluate(() => {
    const run = window.__app.run;
    const levels = {};
    const stuck = [];
    for (const cid of run.released) {
      const p = run.progress[cid] || { level: 1, completed: false };
      const key = p.completed ? "completed" : "L" + p.level;
      levels[key] = (levels[key] || 0) + 1;
      if (!p.completed) {
        stuck.push({
          cid,
          level: p.level,
          type: window.GLOBAL_VOCAB.concepts[cid]?.type,
          testable: window.canConceptBeTested(cid),
        });
      }
    }
    return {
      released: run.released.length,
      planDone: run.releasePlanIndex >= (run.releasePlan || []).length,
      levels,
      stuck,
      sessionNumber: run.sessionNumber,
    };
  });

  // --- report ---
  console.log("\n════ PROGRESSION DIAGNOSTIC ════");
  console.log(`pack: ${PACK} · stopped: ${stats.stoppedBecause}`);
  console.log(`exercises answered (all correct): ${stats.exercises} across ${stats.sessions} sessions (run.sessionNumber=${finalState.sessionNumber})`);
  console.log(`release plan fully unlocked: ${finalState.planDone} · concepts released: ${finalState.released}`);
  console.log("\nexercises shown, by level:");
  for (const k of Object.keys(stats.byLevel).sort()) {
    console.log(`  Level ${k}: ${stats.byLevel[k]}`);
  }
  console.log("\nfinal concept states:");
  for (const k of Object.keys(finalState.levels).sort()) {
    console.log(`  ${k}: ${finalState.levels[k]}`);
  }
  const stuck = finalState.stuck;
  const untestable = stuck.filter((s) => !s.testable);
  console.log(`\nincomplete concepts: ${stuck.length} — of which UNTESTABLE right now: ${untestable.length}`);
  const byLevelType = {};
  for (const s of untestable) {
    const k = `L${s.level} ${s.type}`;
    byLevelType[k] = (byLevelType[k] || 0) + 1;
  }
  console.log("untestable breakdown (level × type):");
  for (const k of Object.keys(byLevelType).sort()) console.log(`  ${k}: ${byLevelType[k]}`);
  console.log("\nsample of untestable concepts:", untestable.slice(0, 20).map((s) => `${s.cid}(L${s.level})`).join(", "));
} finally {
  await browser.close();
  server.kill();
}
