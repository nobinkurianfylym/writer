import { loadEnv, z } from "@fylym/config/env";

const schema = z.object({
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
});

export type WorkerEnv = z.infer<typeof schema>;

export function getWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv(schema, source);
}
