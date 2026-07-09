import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";

const url =
  process.env.DATABASE_URL ??
  "postgresql://fylym:fylym@localhost:5432/fylym";

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);

  const { PrismaClient } = await import("..//node_modules/.prisma/client/default.js");
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.upsert({
      where: { email: "demo@fylym.dev" },
      update: {},
      create: {
        email: "demo@fylym.dev",
        emailVerified: new Date(),
        name: "Demo Writer",
        locale: "en",
      },
    });

    console.log(`Seeded user: ${user.id} (${user.email})`);

    const org = await prisma.organization.upsert({
      where: { slug: "demo-org" },
      update: {},
      create: {
        name: "Demo Studio",
        slug: "demo-org",
        plan: "FREE",
        seatLimit: 5,
      },
    });

    console.log(`Seeded org: ${org.id} (${org.slug})`);

    await prisma.membership.upsert({
      where: {
        userId_orgId: { userId: user.id, orgId: org.id },
      },
      update: {},
      create: {
        userId: user.id,
        orgId: org.id,
        role: "OWNER",
      },
    });

    const project = await prisma.project.upsert({
      where: { id: "demo-project-001" },
      update: {},
      create: {
        id: "demo-project-001",
        orgId: org.id,
        title: "Diner Conversations",
        logline:
          "Three old friends reconnect over coffee in a late-night diner, each hiding a secret.",
        genre: ["Drama"],
        format: "FEATURE",
      },
    });

    console.log(`Seeded project: ${project.id} (${project.title})`);

    const script = await prisma.script.upsert({
      where: { id: "demo-script-001" },
      update: {},
      create: {
        id: "demo-script-001",
        projectId: project.id,
        title: "Diner Conversations - Draft 1",
        formatProfile: "us-feature",
      },
    });

    console.log(`Seeded script: ${script.id} (${script.title})`);

    const initHash = createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from(org.id),
          Buffer.from("seed"),
          Buffer.from("seed.init"),
          randomBytes(16),
        ]),
      )
      .digest();

    await prisma.auditLog.upsert({
      where: { id: 1n },
      update: {},
      create: {
        orgId: org.id,
        actorId: user.id,
        action: "seed.init",
        target: `org:${org.id}`,
        metadata: { source: "prisma-seed", version: "0.0.0" },
        prevHash: null,
        hash: initHash,
      },
    });

    console.log("Seeded audit log entry");
    console.log("Seed complete.");

    await prisma.$disconnect();
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
