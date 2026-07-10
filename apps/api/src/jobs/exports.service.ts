import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateExport } from "@fylym/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { QueueService } from "./queue.service";

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

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
