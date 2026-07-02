import js from "@eslint/js";
import globals from "globals";

// Static-analysis safety net. The priority is catching the class of bug that
// actually breaks this app — references to undefined variables/functions,
// unused or shadowed declarations — not enforcing style on existing code.

export default [
  {
    ignores: [
      "node_modules/",
      "outputs/",
      "test-results/",
      "playwright-report/",
      "scripts/_pack_data/",
      "scripts/_template_data/",
      "scripts/_verb_data/",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      // Real-bug rules stay errors (no-undef, no-dupe-*, no-unreachable, …).
      // These two flag latent cruft in existing code; keep them visible as
      // warnings without blocking CI on a legacy cleanup.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Front-end (browser) files.
    files: ["app.js", "audioengine.js", "languages.js", "user_state.js", "sentence_engine.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    // Node scripts: serverless functions, validators, tooling, tests.
    files: ["netlify/**/*.js", "validation/**/*.{js,mjs}", "scripts/**/*.js", "tests/**/*.mjs", "playwright.config.mjs", "eslint.config.mjs", "generatelanguageskeleton.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Netlify functions and root codegen utilities are CommonJS.
    files: ["netlify/**/*.js", "generatelanguageskeleton.js"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // E2e specs run code inside page.evaluate(), which executes in the
    // browser — window/document are legitimate there.
    files: ["tests/e2e/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The encoding validator scans for control characters on purpose.
    files: ["validation/validate-encoding.js"],
    rules: { "no-control-regex": "off" },
  },
];
