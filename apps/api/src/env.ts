import { loadEnv, z } from "@fylym/config/env";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  APP_URL: z.string().url().default("http://localhost:5173"),
});

export type ApiEnv = z.infer<typeof schema>;

export function getApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(schema, source);
}
