import { defineConfig, devices } from "@playwright/test";

/**
 * E2-2's accept criteria requires Playwright-driven keystroke tests against
 * a real, rendered <ScriptEditor> (contentEditable + a genuine browser's
 * input-event pipeline) — the headless prosemirror-state unit tests in
 * packages/editor prove the command/plugin *logic* is correct, but they
 * can't prove real keystrokes reach it the way a user's typing does (see
 * e2e/README.md for a concrete case this caught: a smart-type input rule
 * that fires on real typing but not on synthetic `execCommand` input).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/editor-dev",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
