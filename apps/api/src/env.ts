import { loadEnv, z } from "@fylym/config/env";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
});

export type ApiEnv = z.infer<typeof schema>;

export function getApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(schema, source);
}
