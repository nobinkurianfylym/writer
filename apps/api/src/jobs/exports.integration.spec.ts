import { describe, it, expect, vi } from "vitest";
import { ExportsService } from "./exports.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "./queue.service";
import type { AuditService } from "../audit/audit.service";

function createService(script: unknown) {
  const prisma = {
    db: { script: { findUnique: vi.fn().mockResolvedValue(script) } },
  } as unknown as PrismaService;
  const enqueue = vi.fn().mockResolvedValue("job-123");
  const queue = { enqueue } as unknown as QueueService;
  const log = vi.fn().mockResolvedValue(undefined);
  const audit = { log } as unknown as AuditService;
  return { service: new ExportsService(prisma, queue, audit), enqueue, log };
}

describe("ExportsService", () => {
  it("enqueues an export job with the requested format and options", async () => {
    const { service, enqueue, log } = createService({
      deletedAt: null,
      project: { orgId: "org-1" },
    });

    const result = await service.requestExport("script-1", "user-1", {
      format: "pdf",
      options: { sceneNumbers: true, watermark: "DRAFT", titlePage: true },
    });

    expect(result).toEqual({ jobId: "job-123" });
    expect(enqueue).toHaveBeenCalledWith(
      "export",
      expect.objectContaining({
        kind: "export",
        scriptId: "script-1",
        format: "pdf",
        requestedBy: "user-1",
        options: { sceneNumbers: true, watermark: "DRAFT", titlePage: true },
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        action: "script.export",
        target: "script-1",
        metadata: { format: "pdf", jobId: "job-123" },
      }),
    );
  });

  it("rejects export of a missing script", async () => {
    const { service, enqueue } = createService(null);
    await expect(
      service.requestExport("gone", "user-1", { format: "fdx" }),
    ).rejects.toThrow("Script not found");
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects export of a soft-deleted script", async () => {
    const { service } = createService({
      deletedAt: new Date(),
      project: { orgId: "org-1" },
    });
    await expect(
      service.requestExport("trashed", "user-1", { format: "fountain" }),
    ).rejects.toThrow("Script not found");
  });
});
