import { loadEnv, z } from "@fylym/config/env";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

export type WebEnv = z.infer<typeof schema>;

export function getWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  return loadEnv(schema, source);
}
