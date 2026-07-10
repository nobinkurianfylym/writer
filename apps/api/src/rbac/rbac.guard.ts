import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { OrgRole, ProjectRole } from "@fylym/db";
import { PrismaService } from "../prisma/prisma.service";
import { PERMISSION_KEY } from "./require-permission.decorator";
import { evaluatePolicy } from "./policy-table";

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    const orgId =
      (request.params.orgId as string | undefined) ??
      (request.body as Record<string, unknown>)?.orgId as string | undefined;

    let projectId =
      (request.params.projectId as string | undefined) ??
      (request.params.id as string | undefined);

    // Script routes carry a scriptId — resolve it to the owning project
    const scriptId = request.params.scriptId as string | undefined;
    if (!projectId && scriptId) {
      const script = await this.prisma.db.script.findUnique({
        where: { id: scriptId },
        select: { projectId: true },
      });
      projectId = script?.projectId;
    }

    let orgRole: OrgRole | null = null;
    let projectRole: ProjectRole | null = null;

    if (orgId) {
      const membership = await this.prisma.db.membership.findUnique({
        where: { userId_orgId: { userId, orgId } },
        select: { role: true },
      });
      orgRole = membership?.role ?? null;
    }

    if (projectId) {
      const project = await this.prisma.db.project.findUnique({
        where: { id: projectId },
        select: { orgId: true },
      });

      if (project && !orgRole) {
        const membership = await this.prisma.db.membership.findUnique({
          where: { userId_orgId: { userId, orgId: project.orgId } },
          select: { role: true },
        });
        orgRole = membership?.role ?? null;
      }

      const collaborator =
        await this.prisma.db.projectCollaborator.findUnique({
          where: { projectId_userId: { projectId, userId } },
          select: { role: true },
        });
      projectRole = collaborator?.role ?? null;
    }

    if (!evaluatePolicy(action, orgRole, projectRole)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
