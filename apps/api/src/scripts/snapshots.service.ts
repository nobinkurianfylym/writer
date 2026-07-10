import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import type {
  CreateSnapshot,
  Snapshot as SnapshotDto,
  CursorPage,
} from "@fylym/contracts";
import type { Snapshot } from "@fylym/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    scriptId: string,
    actorId: string,
    input: CreateSnapshot,
  ): Promise<SnapshotDto> {
    const script = await this.resolveScript(scriptId);

    if (!script.ydocState) {
      throw new ConflictException(
        "Script has no stored state to snapshot yet",
      );
    }

    const snapshot = await this.prisma.db.snapshot.create({
      data: {
        scriptId,
        label: input.label ?? null,
        kind: "MANUAL",
        ydocState: script.ydocState,
        createdById: actorId,
      },
    });

    return this.toDto(snapshot);
  }

  async list(
    scriptId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<CursorPage<SnapshotDto>> {
    await this.resolveScript(scriptId);

    const snapshots = await this.prisma.db.snapshot.findMany({
      where: { scriptId },
      orderBy: { id: "desc" },
      take: opts.limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });

    const hasMore = snapshots.length > opts.limit;
    const items = hasMore ? snapshots.slice(0, opts.limit) : snapshots;

    return {
      items: items.map((s) => this.toDto(s)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async restore(
    scriptId: string,
    snapshotId: string,
    actorId: string,
  ): Promise<SnapshotDto> {
    const script = await this.resolveScript(scriptId);

    const snapshot = await this.prisma.db.snapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot || snapshot.scriptId !== scriptId) {
      throw new NotFoundException("Snapshot not found");
    }

    await this.prisma.db.script.update({
      where: { id: scriptId },
      data: {
        ydocState: snapshot.ydocState,
        ydocVector: null,
      },
    });

    const project = await this.prisma.db.project.findUnique({
      where: { id: script.projectId },
      select: { orgId: true },
    });
    if (project) {
      await this.audit.log({
        orgId: project.orgId,
        actorId,
        action: "script.snapshot.restore",
        target: scriptId,
        metadata: { snapshotId },
      });
    }

    return this.toDto(snapshot);
  }

  private async resolveScript(scriptId: string) {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
    });
    if (!script || script.deletedAt) {
      throw new NotFoundException("Script not found");
    }
    return script;
  }

  private toDto(snapshot: Snapshot): SnapshotDto {
    return {
      id: snapshot.id,
      scriptId: snapshot.scriptId,
      label: snapshot.label,
      kind: snapshot.kind,
      createdById: snapshot.createdById,
      createdAt: snapshot.createdAt.toISOString(),
    };
  }
}
