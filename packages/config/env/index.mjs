import { existsSync } from "node:fs";
import { z } from "zod";

/**
 * Loads a .env file into process.env if present. Node-only apps (api, worker)
 * need this explicitly — unlike Next.js, tsx/node don't auto-load .env files.
 * Safe to call where the file doesn't exist (CI/prod inject env vars directly).
 */
export function loadDotEnvIfPresent(path = ".env") {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/**
 * Parses `source` (defaults to process.env) against `schema`. On failure,
 * throws a single-line Error naming the first offending key so a bootstrap
 * script can print it and exit without a stack trace (§Appendix A).
 */
export function loadEnv(schema, source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issue = result.error.issues[0];
    const key = issue.path.join(".") || "(unknown)";
    throw new Error(`Invalid environment: "${key}" — ${issue.message}`);
  }
  return result.data;
}

export function reportEnvErrorAndExit(error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export { z };
