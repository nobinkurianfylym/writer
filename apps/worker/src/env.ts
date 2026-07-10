import { loadEnv, z } from "@fylym/config/env";

const schema = z.object({
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("fylym-exports"),
  S3_ACCESS_KEY_ID: z.string().default("fylym"),
  S3_SECRET_ACCESS_KEY: z.string().default("fylym-dev-secret"),
  // MinIO needs path-style addressing; real S3 uses virtual-hosted style.
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  // Signed download URLs are short-lived (§9).
  SIGNED_URL_TTL_SEC: z.coerce.number().int().positive().default(300),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export type WorkerEnv = z.infer<typeof schema>;

export function getWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv(schema, source);
}
