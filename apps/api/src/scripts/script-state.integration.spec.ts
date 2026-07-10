import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { SnapshotSchema, ScriptStateSchema } from "@fylym/contracts";
import { ScriptStateService, STATE_CEILING_BYTES } from "./script-state.service";
import { SnapshotsService } from "./snapshots.service";

/* ---------- In-memory fakes ---------- */

interface ScriptRecord {
  id: string;
  projectId: string;
  deletedAt: Date | null;
  ydocState: Uint8Array | null;
  ydocVector: Uint8Array | null;
  updatedAt: Date;
  [key: string]: unknown;
}

class FakeScriptStore {
  records = new Map<string, ScriptRecord>();

  findUnique(args: {
    where: { id: string };
    include?: unknown;
    select?: unknown;
  }) {
    const rec = this.records.get(args.where.id);
    if (!rec) return null;
    if (args.include) {
      return { ...rec, project: this.projectFor(rec) };
    }
    return rec;
  }

  update(args: { where: { id: string }; data: Record<string, unknown> }) {
    const rec = this.records.get(args.where.id);
    if (!rec) throw new Error("Not found");
    Object.assign(rec, args.data, { updatedAt: new Date() });
    return rec;
  }

  projectFor: (rec: ScriptRecord) => {
    deletedAt: Date | null;
    org: { plan: string };
  } = () => ({ deletedAt: null, org: { plan: "FREE" } });
}

class FakeSnapshotStore {
  records = new Map<string, Record<string, unknown>>();
  private seq = 0;

  findUnique(args: { where: { id: string } }) {
    return this.records.get(args.where.id) ?? null;
  }

  findMany(args: {
    where: { scriptId: string };
    orderBy: { id: "desc" | "asc" };
    take: number;
    cursor?: { id: string };
    skip?: number;
  }) {
    let matching = [...this.records.values()].filter(
      (r) => r.scriptId === args.where.scriptId,
    );
    matching.sort((a, b) =>
      args.orderBy.id === "desc"
        ? (b.id as string).localeCompare(a.id as string)
        : (a.id as string).localeCompare(b.id as string),
    );
    if (args.cursor) {
      const idx = matching.findIndex((r) => r.id === args.cursor!.id);
      matching = idx >= 0 ? matching.slice(idx + (args.skip ?? 0)) : [];
    }
    return matching.slice(0, args.take);
  }

  create(args: { data: Record<string, unknown> }) {
    // valid uuid whose tail is a zero-padded sequence, so lexicographic
    // order matches insertion order (like uuid v7 in production)
    const tail = String(this.seq++).padStart(12, "0");
    const id = `00000000-0000-7000-8000-${tail}`;
    const snapshot = { id, ...args.data, createdAt: new Date() };
    this.records.set(id, snapshot);
    return snapshot;
  }
}

function createTestServices(plan = "FREE") {
  const scriptStore = new FakeScriptStore();
  const snapshotStore = new FakeSnapshotStore();
  scriptStore.projectFor = () => ({ deletedAt: null, org: { plan } });

  const projectStore = {
    findUnique: vi.fn().mockResolvedValue({ orgId: randomUUID() }),
  };

  const mockPrisma = {
    db: {
      script: scriptStore,
      snapshot: snapshotStore,
      project: projectStore,
    },
  } as unknown as ConstructorParameters<typeof ScriptStateService>[0];

  const auditLog = vi.fn().mockResolvedValue(undefined);
  const mockAudit = {
    log: auditLog,
  } as unknown as ConstructorParameters<typeof SnapshotsService>[1];

  const enqueue = vi.fn().mockResolvedValue("derive-job-1");
  const mockQueue = {
    enqueue,
  } as unknown as ConstructorParameters<typeof ScriptStateService>[1];

  const stateService = new ScriptStateService(mockPrisma, mockQueue);
  const snapshotsService = new SnapshotsService(
    mockPrisma as unknown as ConstructorParameters<typeof SnapshotsService>[0],
    mockAudit,
  );

  return { stateService, snapshotsService, scriptStore, snapshotStore, auditLog, enqueue };
}

function seedScript(store: FakeScriptStore): string {
  const id = randomUUID();
  store.records.set(id, {
    id,
    projectId: randomUUID(),
    deletedAt: null,
    ydocState: null,
    ydocVector: null,
    updatedAt: new Date(),
  });
  return id;
}

const ACTOR_ID = randomUUID();

/* ---------- Tests ---------- */

describe("Script state endpoints", () => {
  let svc: ReturnType<typeof createTestServices>;
  let scriptId: string;

  beforeEach(() => {
    svc = createTestServices();
    scriptId = seedScript(svc.scriptStore);
  });

  it("stores an uncompressed state upload and round-trips through GET", async () => {
    const original = Buffer.from("yjs-state-payload-".repeat(100));

    const result = await svc.stateService.putState(scriptId, {
      ydocState: original.toString("base64"),
      compression: "none",
    });
    expect(result.bytes).toBe(original.byteLength);

    const state = await svc.stateService.getState(scriptId);
    expect(ScriptStateSchema.safeParse(state).success).toBe(true);
    expect(state.compression).toBe("zstd");

    const roundTripped = zstdDecompressSync(
      Buffer.from(state.ydocState, "base64"),
    );
    expect(roundTripped.equals(original)).toBe(true);
  });

  it("enqueues a SceneIndex derive job after storing state", async () => {
    await svc.stateService.putState(scriptId, {
      ydocState: Buffer.from("state").toString("base64"),
      compression: "none",
    });
    expect(svc.enqueue).toHaveBeenCalledWith("derive", {
      kind: "derive",
      scriptId,
    });
  });

  it("accepts a zstd-compressed upload and stores decompressed bytes", async () => {
    const original = Buffer.from("compressed-yjs-doc-".repeat(500));
    const compressed = zstdCompressSync(original);

    const result = await svc.stateService.putState(scriptId, {
      ydocState: compressed.toString("base64"),
      compression: "zstd",
    });

    expect(result.bytes).toBe(original.byteLength);
    const stored = svc.scriptStore.records.get(scriptId)!.ydocState!;
    expect(Buffer.from(stored).equals(original)).toBe(true);
  });

  it("stores and returns the ydocVector alongside the state", async () => {
    const state = Buffer.from("state");
    const vector = Buffer.from("vector-bytes");

    await svc.stateService.putState(scriptId, {
      ydocState: state.toString("base64"),
      ydocVector: vector.toString("base64"),
      compression: "none",
    });

    const fetched = await svc.stateService.getState(scriptId);
    expect(
      Buffer.from(fetched.ydocVector!, "base64").equals(vector),
    ).toBe(true);
  });

  it("enforces the FREE plan ceiling with a 413", async () => {
    const oversized = Buffer.alloc(STATE_CEILING_BYTES.FREE + 1, 0x61);

    await expect(
      svc.stateService.putState(scriptId, {
        ydocState: oversized.toString("base64"),
        compression: "none",
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("ceiling applies to decompressed size, not wire size", async () => {
    // Highly compressible payload: tiny on the wire, oversized decompressed
    const oversized = Buffer.alloc(STATE_CEILING_BYTES.FREE + 1, 0x61);
    const compressed = zstdCompressSync(oversized);
    expect(compressed.byteLength).toBeLessThan(STATE_CEILING_BYTES.FREE);

    await expect(
      svc.stateService.putState(scriptId, {
        ydocState: compressed.toString("base64"),
        compression: "zstd",
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("PRO plan ceiling admits what FREE rejects", async () => {
    const proSvc = createTestServices("PRO");
    const proScriptId = seedScript(proSvc.scriptStore);
    const payload = Buffer.alloc(STATE_CEILING_BYTES.FREE + 1, 0x61);

    const result = await proSvc.stateService.putState(proScriptId, {
      ydocState: zstdCompressSync(payload).toString("base64"),
      compression: "zstd",
    });
    expect(result.bytes).toBe(payload.byteLength);
  });

  it("rejects garbage zstd payloads with a 400", async () => {
    await expect(
      svc.stateService.putState(scriptId, {
        ydocState: Buffer.from("not zstd data").toString("base64"),
        compression: "zstd",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("GET returns 404 when no state stored yet", async () => {
    await expect(svc.stateService.getState(scriptId)).rejects.toThrow(
      "no stored state",
    );
  });

  it("returns 404 for a deleted script", async () => {
    svc.scriptStore.records.get(scriptId)!.deletedAt = new Date();
    await expect(
      svc.stateService.putState(scriptId, {
        ydocState: Buffer.from("x").toString("base64"),
        compression: "none",
      }),
    ).rejects.toThrow("Script not found");
  });
});

describe("Snapshots", () => {
  let svc: ReturnType<typeof createTestServices>;
  let scriptId: string;

  beforeEach(async () => {
    svc = createTestServices();
    scriptId = seedScript(svc.scriptStore);
    await svc.stateService.putState(scriptId, {
      ydocState: Buffer.from("initial-state").toString("base64"),
      compression: "none",
    });
  });

  it("creates a MANUAL snapshot with a label", async () => {
    const snapshot = await svc.snapshotsService.create(scriptId, ACTOR_ID, {
      label: "First draft locked",
    });

    expect(snapshot.kind).toBe("MANUAL");
    expect(snapshot.label).toBe("First draft locked");
    expect(snapshot.createdById).toBe(ACTOR_ID);
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("refuses to snapshot a script with no stored state", async () => {
    const empty = seedScript(svc.scriptStore);
    await expect(
      svc.snapshotsService.create(empty, ACTOR_ID, {}),
    ).rejects.toThrow("no stored state");
  });

  it("snapshot → continued editing → restore round-trips", async () => {
    const stateA = Buffer.from("state-A-the-good-draft");
    await svc.stateService.putState(scriptId, {
      ydocState: stateA.toString("base64"),
      compression: "none",
    });

    const snapshot = await svc.snapshotsService.create(scriptId, ACTOR_ID, {
      label: "before rewrite",
    });

    // Continued editing overwrites the state
    const stateB = Buffer.from("state-B-the-regretted-rewrite");
    await svc.stateService.putState(scriptId, {
      ydocState: stateB.toString("base64"),
      compression: "none",
    });

    const current = await svc.stateService.getState(scriptId);
    expect(
      zstdDecompressSync(Buffer.from(current.ydocState, "base64")).equals(
        stateB,
      ),
    ).toBe(true);

    // Restore from the snapshot
    await svc.snapshotsService.restore(scriptId, snapshot.id, ACTOR_ID);

    const restored = await svc.stateService.getState(scriptId);
    expect(
      zstdDecompressSync(Buffer.from(restored.ydocState, "base64")).equals(
        stateA,
      ),
    ).toBe(true);
    expect(restored.ydocVector).toBeNull();
  });

  it("restore writes an audit entry", async () => {
    const snapshot = await svc.snapshotsService.create(scriptId, ACTOR_ID, {});
    await svc.snapshotsService.restore(scriptId, snapshot.id, ACTOR_ID);

    expect(svc.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "script.snapshot.restore",
        actorId: ACTOR_ID,
        target: scriptId,
        metadata: { snapshotId: snapshot.id },
      }),
    );
  });

  it("restore rejects a snapshot belonging to another script", async () => {
    const otherScript = seedScript(svc.scriptStore);
    await svc.stateService.putState(otherScript, {
      ydocState: Buffer.from("other").toString("base64"),
      compression: "none",
    });
    const foreign = await svc.snapshotsService.create(
      otherScript,
      ACTOR_ID,
      {},
    );

    await expect(
      svc.snapshotsService.restore(scriptId, foreign.id, ACTOR_ID),
    ).rejects.toThrow("Snapshot not found");
  });

  it("lists snapshots newest-first with cursor pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await svc.snapshotsService.create(scriptId, ACTOR_ID, {
        label: `v${i}`,
      });
    }

    const page1 = await svc.snapshotsService.list(scriptId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]!.label).toBe("v4"); // newest first
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await svc.snapshotsService.list(scriptId, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);

    const page3 = await svc.snapshotsService.list(scriptId, {
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const labels = [...page1.items, ...page2.items, ...page3.items].map(
      (s) => s.label,
    );
    expect(labels).toEqual(["v4", "v3", "v2", "v1", "v0"]);
  });
});
