import { z } from "zod";

export declare function loadDotEnvIfPresent(path?: string): void;

export declare function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source?: Record<string, string | undefined>,
): z.infer<T>;

export declare function reportEnvErrorAndExit(error: unknown): never;

export { z };
