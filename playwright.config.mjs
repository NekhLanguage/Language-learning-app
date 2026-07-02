import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Test server port — distinct from `npm run dev`'s 8888 so a running dev
// server never collides with the test run.
const PORT = Number(process.env.PW_PORT || 8899);

// Prefer an explicitly provided Chromium, then a preinstalled one (remote
// execution environments ship /opt/pw-browsers/chromium), then Playwright's
// own managed download (CI runs `npx playwright install chromium`).
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PW_CHROMIUM_PATH ||
  (fs.existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: {
    command: "node tests/dev-server.mjs",
    url: `http://127.0.0.1:${PORT}/index.html`,
    env: { PORT: String(PORT), DEV_SERVER_QUIET: "1" },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
