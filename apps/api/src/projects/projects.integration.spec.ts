import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { ProjectSchema, ScriptSchema } from "@fylym/contracts";
import { ProjectsService } from "./projects.service";
import { ScriptsService } from "../scripts/scripts.service";

/* ---------- In-memory entity store (Prisma-shaped) ---------- */

interface EntityRecord {
  id: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

class InMemoryEntityStore {
  records = new Map<string, EntityRecord>();

  constructor(private readonly defaults: Record<string, unknown> = {}) {}

  findUnique(args: {
    where: { id: string };
    select?: Record<string, boolean>;
  }) {
    return this.records.get(args.where.id) ?? null;
  }

  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { id: "asc" | "desc" };
    take: number;
    cursor?: { id: string };
    skip?: number;
  }) {
    const { deletedAt, ...scalarWhere } = args.where as {
      deletedAt: null | { not: null };
      [key: string]: unknown;
    };

    let matching = [...this.records.values()].filter((rec) => {
      for (const [key, val] of Object.entries(scalarWhere)) {
        if (rec[key] !== val) return false;
      }
      if (deletedAt === null) return rec.deletedAt === null;
      return rec.deletedAt !== null;
    });

    matching.sort((a, b) =>
      args.orderBy.id === "asc"
        ? a.id.localeCompare(b.id)
        : b.id.localeCompare(a.id),
    );

    if (args.cursor) {
      const idx = matching.findIndex((r) => r.id === args.cursor!.id);
      matching = idx >= 0 ? matching.slice(idx + (args.skip ?? 0)) : [];
    }

    return matching.slice(0, args.take);
  }

  create(args: { data: Record<string, unknown> }) {
    const record: EntityRecord = {
      id: randomUUID(),
      deletedAt: null,
      ...this.defaults,
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  update(args: { where: { id: string }; data: Record<string, unknown> }) {
    const record = this.records.get(args.where.id);
    if (!record) throw new Error("Record not found");
    Object.assign(record, args.data, { updatedAt: new Date() });
    return record;
  }
}

/* ---------- Test setup ---------- */

function createTestServices() {
  const projectStore = new InMemoryEntityStore({ logline: null });
  const scriptStore = new InMemoryEntityStore({
    pagesLocked: false,
    revisionColor: null,
    formatProfile: "us-feature",
  });

  const mockPrisma = {
    db: { project: projectStore, script: scriptStore },
  } as unknown as ConstructorParameters<typeof ProjectsService>[0];

  const auditLog = vi.fn().mockResolvedValue(undefined);
  const mockAudit = {
    log: auditLog,
  } as unknown as ConstructorParameters<typeof ProjectsService>[1];

  const projectsService = new ProjectsService(mockPrisma, mockAudit);
  const scriptsService = new ScriptsService(
    mockPrisma as unknown as ConstructorParameters<typeof ScriptsService>[0],
    mockAudit as unknown as ConstructorParameters<typeof ScriptsService>[1],
  );

  return { projectsService, scriptsService, projectStore, scriptStore, auditLog };
}

const ORG_ID = randomUUID();
const ACTOR_ID = randomUUID();

describe("Projects CRUD", () => {
  let projects: ProjectsService;
  let stores: ReturnType<typeof createTestServices>;

  beforeEach(() => {
    stores = createTestServices();
    projects = stores.projectsService;
  });

  it("creates a project and returns a contract-valid DTO", async () => {
    const dto = await projects.create(ORG_ID, {
      title: "My Feature",
      logline: "A story about stories",
      genre: ["drama"],
      format: "FEATURE",
    });

    expect(dto.title).toBe("My Feature");
    expect(dto.orgId).toBe(ORG_ID);
    expect(dto.deletedAt).toBeNull();
    expect(ProjectSchema.safeParse(dto).success).toBe(true);
  });

  it("lists projects excluding soft-deleted ones", async () => {
    const p1 = await projects.create(ORG_ID, {
      title: "Visible",
      genre: [],
      format: "FEATURE",
    });
    const p2 = await projects.create(ORG_ID, {
      title: "Trashed",
      genre: [],
      format: "FEATURE",
    });

    await projects.softDelete(p2.id, ACTOR_ID);

    const page = await projects.list(ORG_ID, { limit: 20 });
    expect(page.items.map((p) => p.id)).toEqual([p1.id]);
  });

  it("trash listing shows only soft-deleted projects", async () => {
    await projects.create(ORG_ID, {
      title: "Visible",
      genre: [],
      format: "FEATURE",
    });
    const trashed = await projects.create(ORG_ID, {
      title: "Trashed",
      genre: [],
      format: "FEATURE",
    });
    await projects.softDelete(trashed.id, ACTOR_ID);

    const page = await projects.list(ORG_ID, { limit: 20, trash: true });
    expect(page.items.map((p) => p.id)).toEqual([trashed.id]);
    expect(page.items[0]!.deletedAt).not.toBeNull();
  });

  it("paginates with cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await projects.create(ORG_ID, {
        title: `P${i}`,
        genre: [],
        format: "FEATURE",
      });
    }

    const page1 = await projects.list(ORG_ID, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await projects.list(ORG_ID, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await projects.list(ORG_ID, {
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allIds = [
      ...page1.items,
      ...page2.items,
      ...page3.items,
    ].map((p) => p.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it("gets a project by id", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Findable",
      genre: [],
      format: "FEATURE",
    });
    const found = await projects.get(created.id);
    expect(found.id).toBe(created.id);
  });

  it("get returns 404 for missing project", async () => {
    await expect(projects.get(randomUUID())).rejects.toThrow(
      "Project not found",
    );
  });

  it("get returns 404 for soft-deleted project", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Gone",
      genre: [],
      format: "FEATURE",
    });
    await projects.softDelete(created.id, ACTOR_ID);
    await expect(projects.get(created.id)).rejects.toThrow(
      "Project not found",
    );
  });

  it("patches project fields", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Before",
      genre: [],
      format: "FEATURE",
    });

    const updated = await projects.patch(created.id, {
      title: "After",
      logline: "New logline",
    });

    expect(updated.title).toBe("After");
    expect(updated.logline).toBe("New logline");
    expect(updated.format).toBe("FEATURE");
  });

  it("soft delete writes an audit entry", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Doomed",
      genre: [],
      format: "FEATURE",
    });
    await projects.softDelete(created.id, ACTOR_ID);

    expect(stores.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        actorId: ACTOR_ID,
        action: "project.delete",
        target: created.id,
      }),
    );
  });

  it("restores a trashed project within retention window", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Phoenix",
      genre: [],
      format: "FEATURE",
    });
    await projects.softDelete(created.id, ACTOR_ID);

    const restored = await projects.restore(created.id, ACTOR_ID);
    expect(restored.deletedAt).toBeNull();

    const page = await projects.list(ORG_ID, { limit: 20 });
    expect(page.items.map((p) => p.id)).toContain(created.id);
  });

  it("restore fails after 30-day retention window", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Too Late",
      genre: [],
      format: "FEATURE",
    });
    await projects.softDelete(created.id, ACTOR_ID);

    // Backdate the deletion past the retention window
    const record = stores.projectStore.records.get(created.id)!;
    record.deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    await expect(projects.restore(created.id, ACTOR_ID)).rejects.toThrow(
      "retention period has expired",
    );
  });

  it("restore fails for a project not in trash", async () => {
    const created = await projects.create(ORG_ID, {
      title: "Alive",
      genre: [],
      format: "FEATURE",
    });
    await expect(projects.restore(created.id, ACTOR_ID)).rejects.toThrow(
      "Project not found in trash",
    );
  });
});

describe("Scripts CRUD", () => {
  let projects: ProjectsService;
  let scripts: ScriptsService;
  let stores: ReturnType<typeof createTestServices>;
  let projectId: string;

  beforeEach(async () => {
    stores = createTestServices();
    projects = stores.projectsService;
    scripts = stores.scriptsService;
    const project = await projects.create(ORG_ID, {
      title: "Host Project",
      genre: [],
      format: "FEATURE",
    });
    projectId = project.id;
  });

  it("creates a script and returns a contract-valid DTO", async () => {
    const dto = await scripts.create(projectId, {
      title: "Draft 1",
      formatProfile: "us-feature",
    });

    expect(dto.title).toBe("Draft 1");
    expect(dto.projectId).toBe(projectId);
    expect(dto.formatProfile).toBe("us-feature");
    expect(dto.pagesLocked).toBe(false);
    expect(ScriptSchema.safeParse(dto).success).toBe(true);
  });

  it("create fails when parent project is missing or trashed", async () => {
    await expect(
      scripts.create(randomUUID(), {
        title: "Orphan",
        formatProfile: "us-feature",
      }),
    ).rejects.toThrow("Project not found");

    await projects.softDelete(projectId, ACTOR_ID);
    await expect(
      scripts.create(projectId, {
        title: "In trashed project",
        formatProfile: "us-feature",
      }),
    ).rejects.toThrow("Project not found");
  });

  it("lists scripts excluding trash, paginated", async () => {
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await scripts.create(projectId, {
        title: `S${i}`,
        formatProfile: "us-feature",
      });
      created.push(s.id);
    }
    await scripts.softDelete(created[0]!, ACTOR_ID);

    const page = await scripts.list(projectId, { limit: 20 });
    expect(page.items).toHaveLength(2);
    expect(page.items.map((s) => s.id)).not.toContain(created[0]);

    const page1 = await scripts.list(projectId, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
  });

  it("renames a script via patch", async () => {
    const s = await scripts.create(projectId, {
      title: "Old Name",
      formatProfile: "us-feature",
    });
    const renamed = await scripts.patch(s.id, { title: "New Name" });
    expect(renamed.title).toBe("New Name");
  });

  it("soft delete then restore round-trips", async () => {
    const s = await scripts.create(projectId, {
      title: "Recoverable",
      formatProfile: "us-feature",
    });

    await scripts.softDelete(s.id, ACTOR_ID);
    await expect(scripts.get(s.id)).rejects.toThrow("Script not found");

    expect(stores.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        action: "script.delete",
        target: s.id,
      }),
    );

    const restored = await scripts.restore(s.id, ACTOR_ID);
    expect(restored.deletedAt).toBeNull();
    const found = await scripts.get(s.id);
    expect(found.id).toBe(s.id);
  });

  it("restore fails after 30-day retention window", async () => {
    const s = await scripts.create(projectId, {
      title: "Expired",
      formatProfile: "us-feature",
    });
    await scripts.softDelete(s.id, ACTOR_ID);

    const record = stores.scriptStore.records.get(s.id)!;
    record.deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    await expect(scripts.restore(s.id, ACTOR_ID)).rejects.toThrow(
      "retention period has expired",
    );
  });
});
