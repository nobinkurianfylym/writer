import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateProject,
  PatchProject,
  Project as ProjectDto,
  CursorPage,
} from "@fylym/contracts";
import type { Project } from "@fylym/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, input: CreateProject): Promise<ProjectDto> {
    const project = await this.prisma.db.project.create({
      data: {
        orgId,
        title: input.title,
        logline: input.logline ?? null,
        genre: input.genre,
        format: input.format,
      },
    });

    return this.toDto(project);
  }

  async list(
    orgId: string,
    opts: { cursor?: string; limit: number; trash?: boolean },
  ): Promise<CursorPage<ProjectDto>> {
    const projects = await this.prisma.db.project.findMany({
      where: {
        orgId,
        deletedAt: opts.trash ? { not: null } : null,
      },
      orderBy: { id: "asc" },
      take: opts.limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });

    const hasMore = projects.length > opts.limit;
    const items = hasMore ? projects.slice(0, opts.limit) : projects;

    return {
      items: items.map((p) => this.toDto(p)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async get(projectId: string): Promise<ProjectDto> {
    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.deletedAt) {
      throw new NotFoundException("Project not found");
    }
    return this.toDto(project);
  }

  async patch(
    projectId: string,
    input: PatchProject,
  ): Promise<ProjectDto> {
    const existing = await this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException("Project not found");
    }

    const project = await this.prisma.db.project.update({
      where: { id: projectId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.logline !== undefined && { logline: input.logline }),
        ...(input.genre !== undefined && { genre: input.genre }),
        ...(input.format !== undefined && { format: input.format }),
      },
    });

    return this.toDto(project);
  }

  async softDelete(projectId: string, actorId: string): Promise<void> {
    const existing = await this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException("Project not found");
    }

    await this.prisma.db.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      orgId: existing.orgId,
      actorId,
      action: "project.delete",
      target: projectId,
    });
  }

  async restore(projectId: string, actorId: string): Promise<ProjectDto> {
    const existing = await this.prisma.db.project.findUnique({
      where: { id: projectId },
    });
    if (!existing || !existing.deletedAt) {
      throw new NotFoundException("Project not found in trash");
    }

    const cutoff = new Date(
      Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    if (existing.deletedAt < cutoff) {
      throw new NotFoundException("Project retention period has expired");
    }

    const project = await this.prisma.db.project.update({
      where: { id: projectId },
      data: { deletedAt: null },
    });

    await this.audit.log({
      orgId: existing.orgId,
      actorId,
      action: "project.restore",
      target: projectId,
    });

    return this.toDto(project);
  }

  private toDto(project: Project): ProjectDto {
    return {
      id: project.id,
      orgId: project.orgId,
      title: project.title,
      logline: project.logline,
      genre: project.genre,
      format: project.format,
      deletedAt: project.deletedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
