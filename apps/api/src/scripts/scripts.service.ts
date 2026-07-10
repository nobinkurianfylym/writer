import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateScript,
  PatchScript,
  Script as ScriptDto,
  CursorPage,
} from "@fylym/contracts";
import type { Script } from "@fylym/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class ScriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(projectId: string, input: CreateScript): Promise<ScriptDto> {
    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.deletedAt) {
      throw new NotFoundException("Project not found");
    }

    const script = await this.prisma.db.script.create({
      data: {
        projectId,
        title: input.title,
        formatProfile: input.formatProfile,
      },
    });

    return this.toDto(script);
  }

  async list(
    projectId: string,
    opts: { cursor?: string; limit: number; trash?: boolean },
  ): Promise<CursorPage<ScriptDto>> {
    const scripts = await this.prisma.db.script.findMany({
      where: {
        projectId,
        deletedAt: opts.trash ? { not: null } : null,
      },
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });

    const hasMore = scripts.length > opts.limit;
    const items = hasMore ? scripts.slice(0, opts.limit) : scripts;

    return {
      items: items.map((s) => this.toDto(s)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async get(scriptId: string): Promise<ScriptDto> {
    const script = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
    });
    if (!script || script.deletedAt) {
      throw new NotFoundException("Script not found");
    }
    return this.toDto(script);
  }

  async patch(scriptId: string, input: PatchScript): Promise<ScriptDto> {
    const existing = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException("Script not found");
    }

    const script = await this.prisma.db.script.update({
      where: { id: scriptId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
      },
    });

    return this.toDto(script);
  }

  async softDelete(scriptId: string, actorId: string): Promise<void> {
    const existing = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException("Script not found");
    }

    await this.prisma.db.script.update({
      where: { id: scriptId },
      data: { deletedAt: new Date() },
    });

    const project = await this.prisma.db.project.findUnique({
      where: { id: existing.projectId },
      select: { orgId: true },
    });
    if (project) {
      await this.audit.log({
        orgId: project.orgId,
        actorId,
        action: "script.delete",
        target: scriptId,
      });
    }
  }

  async restore(scriptId: string, actorId: string): Promise<ScriptDto> {
    const existing = await this.prisma.db.script.findUnique({
      where: { id: scriptId },
    });
    if (!existing || !existing.deletedAt) {
      throw new NotFoundException("Script not found in trash");
    }

    const cutoff = new Date(
      Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    if (existing.deletedAt < cutoff) {
      throw new NotFoundException("Script retention period has expired");
    }

    const script = await this.prisma.db.script.update({
      where: { id: scriptId },
      data: { deletedAt: null },
    });

    const project = await this.prisma.db.project.findUnique({
      where: { id: existing.projectId },
      select: { orgId: true },
    });
    if (project) {
      await this.audit.log({
        orgId: project.orgId,
        actorId,
        action: "script.restore",
        target: scriptId,
      });
    }

    return this.toDto(script);
  }

  private toDto(script: Script): ScriptDto {
    return {
      id: script.id,
      projectId: script.projectId,
      title: script.title,
      formatProfile: script.formatProfile,
      revisionColor: script.revisionColor,
      pagesLocked: script.pagesLocked,
      deletedAt: script.deletedAt?.toISOString() ?? null,
      createdAt: script.createdAt.toISOString(),
      updatedAt: script.updatedAt.toISOString(),
    };
  }
}
