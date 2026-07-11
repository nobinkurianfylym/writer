import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export function createPrismaClient(
  connectionString?: string,
): PrismaClient {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgresql://fylym:fylym@localhost:5432/fylym";

  // Allow the app to live in its own Postgres schema (e.g. `?schema=fylym`)
  // so it can share a database whose `public` schema belongs to something
  // else. The `?schema=` param drives the Prisma CLI (migrate/db push); we
  // parse the same value here so generated runtime queries target it too.
  let schema: string | undefined;
  try {
    schema = new URL(url).searchParams.get("schema") ?? undefined;
  } catch {
    schema = undefined;
  }

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export { PrismaClient };
