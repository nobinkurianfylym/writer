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
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("fylym-exports"),
  S3_ACCESS_KEY_ID: z.string().default("fylym"),
  S3_SECRET_ACCESS_KEY: z.string().default("fylym-dev-secret"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  SIGNED_URL_TTL_SEC: z.coerce.number().int().positive().default(300),
});

export type ApiEnv = z.infer<typeof schema>;

export function getApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return loadEnv(schema, source);
}
