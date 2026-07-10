import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ holds Playwright specs (run via `pnpm test:e2e`, not vitest) —
    // vitest's default include glob would otherwise pick up its *.spec.ts
    // files and fail trying to execute test()/test.describe() from
    // @playwright/test as if they were vitest tests. Extends (not
    // replaces) vitest's own default exclude list.
    exclude: [...configDefaults.exclude, "**/e2e/**"],
  },
});
