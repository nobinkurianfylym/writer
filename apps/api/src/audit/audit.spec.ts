import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { AuditService } from "./audit.service";

/* ---------- In-memory AuditLog store ---------- */

class InMemoryAuditLogStore {
  private autoId = 1n;
  logs: Array<{
    id: bigint;
    orgId: string;
    actorId: string | null;
    action: string;
    target: string | null;
    ip: string | null;
    metadata: unknown;
    prevHash: Buffer | null;
    hash: Buffer;
    createdAt: Date;
  }> = [];

  findFirst(args: {
    where: { orgId: string };
    orderBy: { id: "desc" | "asc" };
    select: { hash: boolean };
  }) {
    const matching = this.logs.filter(
      (l) => l.orgId === args.where.orgId,
    );
    if (matching.length === 0) return null;
    if (args.orderBy.id === "desc") {
      return matching[matching.length - 1] ?? null;
    }
    return matching[0] ?? null;
  }

  findMany(args: {
    where: { orgId: string };
    orderBy: { id: "asc" | "desc" };
  }) {
    const matching = this.logs.filter(
      (l) => l.orgId === args.where.orgId,
    );
    if (args.orderBy.id === "desc") {
      return [...matching].reverse();
    }
    return [...matching];
  }

  create(args: { data: Record<string, unknown> }) {
    const entry = {
      id: this.autoId++,
      orgId: args.data.orgId as string,
      actorId: (args.data.actorId as string | null) ?? null,
      action: args.data.action as string,
      target: (args.data.target as string | null) ?? null,
      ip: (args.data.ip as string | null) ?? null,
      metadata: args.data.metadata ?? null,
      prevHash: args.data.prevHash as Buffer | null,
      hash: args.data.hash as Buffer,
      createdAt: new Date(),
    };
    this.logs.push(entry);
    return entry;
  }
}

/* ---------- Tests ---------- */

describe("AuditService — hash chain", () => {
  let auditService: AuditService;
  let auditLogStore: InMemoryAuditLogStore;
  const ORG_ID = randomUUID();
  const ACTOR_ID = randomUUID();

  beforeEach(() => {
    auditLogStore = new InMemoryAuditLogStore();
    const mockPrisma = {
      db: { auditLog: auditLogStore },
    } as unknown as ConstructorParameters<typeof AuditService>[0];

    auditService = new AuditService(mockPrisma);
  });

  it("first log entry has null prevHash", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
      target: ACTOR_ID,
    });

    expect(auditLogStore.logs).toHaveLength(1);
    expect(auditLogStore.logs[0]!.prevHash).toBeNull();
    expect(auditLogStore.logs[0]!.hash.length).toBe(32); // SHA-256
  });

  it("subsequent entries chain hashes correctly", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.login",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "project.create",
      target: "project-123",
    });

    expect(auditLogStore.logs).toHaveLength(3);

    // Each entry's prevHash should equal the previous entry's hash
    expect(auditLogStore.logs[1]!.prevHash).not.toBeNull();
    expect(
      Buffer.from(auditLogStore.logs[1]!.prevHash!).equals(
        auditLogStore.logs[0]!.hash,
      ),
    ).toBe(true);

    expect(
      Buffer.from(auditLogStore.logs[2]!.prevHash!).equals(
        auditLogStore.logs[1]!.hash,
      ),
    ).toBe(true);
  });

  it("verifyChain succeeds on valid chain", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.login",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "project.create",
      target: "proj-1",
      metadata: { title: "My Script" },
    });

    const valid = await auditService.verifyChain(ORG_ID);
    expect(valid).toBe(true);
  });

  it("verifyChain fails when a row is tampered", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.login",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "project.delete",
      target: "proj-1",
    });

    // Tamper with the second entry's action
    auditLogStore.logs[1]!.action = "auth.TAMPERED";

    const valid = await auditService.verifyChain(ORG_ID);
    expect(valid).toBe(false);
  });

  it("verifyChain fails when hash is replaced", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.login",
    });

    // Replace first entry's hash with garbage
    auditLogStore.logs[0]!.hash = createHash("sha256")
      .update("fake")
      .digest();

    const valid = await auditService.verifyChain(ORG_ID);
    expect(valid).toBe(false);
  });

  it("verifyChain returns true for empty org (no logs)", async () => {
    const valid = await auditService.verifyChain(randomUUID());
    expect(valid).toBe(true);
  });

  it("hash_n = SHA-256(hash_{n-1} || row) matches manual computation", async () => {
    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
      target: ACTOR_ID,
    });

    const entry = auditLogStore.logs[0]!;
    const rowContent = JSON.stringify({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
      target: ACTOR_ID,
      metadata: null,
    });

    // First entry: no prevHash, so just hash the row content
    const expected = createHash("sha256").update(rowContent).digest();
    expect(Buffer.from(entry.hash).equals(expected)).toBe(true);
  });

  it("separate orgs have independent chains", async () => {
    const ORG_ID_2 = randomUUID();

    await auditService.log({
      orgId: ORG_ID,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    await auditService.log({
      orgId: ORG_ID_2,
      actorId: ACTOR_ID,
      action: "auth.register",
    });

    // Both should have null prevHash (independent chains)
    const org1Logs = auditLogStore.logs.filter((l) => l.orgId === ORG_ID);
    const org2Logs = auditLogStore.logs.filter((l) => l.orgId === ORG_ID_2);

    expect(org1Logs[0]!.prevHash).toBeNull();
    expect(org2Logs[0]!.prevHash).toBeNull();

    // Hashes should differ because orgId is part of the content
    expect(
      Buffer.from(org1Logs[0]!.hash).equals(org2Logs[0]!.hash),
    ).toBe(false);

    // Both chains should verify independently
    expect(await auditService.verifyChain(ORG_ID)).toBe(true);
    expect(await auditService.verifyChain(ORG_ID_2)).toBe(true);
  });
});
