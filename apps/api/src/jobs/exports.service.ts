import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateExport } from "@fylym/contracts";
import { exportFromYState } from "@fylym/worker";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { QueueService } from "./queue.service";

export interface InlineExport {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

/** Filesystem-safe basename derived from the script title. */
function safeBaseName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "script";
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generate an export in-process and return the bytes for the API to stream
   * straight to the browser as a download — no worker, no object storage.
   */
  async exportInline(
    scriptId: string,
    actorId: string,
    input: CreateExport,
  ): Promise<InlineExport> {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
      select: {
        title: true,
        ydocState: true,
        formatProfile: true,
        deletedAt: true,
        project: { select: { orgId: true } },
      },
    });
    if (!script || script.deletedAt) {
      throw new NotFoundException("Script not found");
    }
    if (!script.ydocState) {
      throw new NotFoundException("Script has no saved content to export yet");
    }

    const artifact = await exportFromYState(
      new Uint8Array(script.ydocState),
      script.formatProfile,
      input.format,
      input.options ?? {},
    );

    await this.audit.log({
      orgId: script.project.orgId,
      actorId,
      action: "script.export",
      target: scriptId,
      metadata: { format: input.format, mode: "inline" },
    });

    return {
      bytes: artifact.bytes,
      contentType: artifact.contentType,
      filename: `${safeBaseName(script.title)}.${artifact.extension}`,
    };
  }

  async requestExport(
    scriptId: string,
    actorId: string,
    input: CreateExport,
  ): Promise<{ jobId: string }> {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
      select: { deletedAt: true, project: { select: { orgId: true } } },
    });
    if (!script || script.deletedAt) {
      throw new NotFoundException("Script not found");
    }

    const jobId = await this.queue.enqueue("export", {
      kind: "export",
      scriptId,
      format: input.format,
      options: input.options,
      requestedBy: actorId,
    });

    await this.audit.log({
      orgId: script.project.orgId,
      actorId,
      action: "script.export",
      target: scriptId,
      metadata: { format: input.format, jobId },
    });

    return { jobId };
  }
}
