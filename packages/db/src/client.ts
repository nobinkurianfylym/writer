import { PrismaClient } from ".prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export function createPrismaClient(
  connectionString?: string,
): PrismaClient {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgresql://fylym:fylym@localhost:5432/fylym";

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export { PrismaClient };
