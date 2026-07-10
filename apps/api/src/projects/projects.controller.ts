import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  CreateProjectSchema,
  PatchProjectSchema,
  CursorPageParamsSchema,
} from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { ProjectsService } from "./projects.service";

@Controller()
@UseGuards(JwtGuard, RbacGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post("v1/orgs/:orgId/projects")
  @RequirePermission("project.create")
  async create(@Param("orgId") orgId: string, @Body() body: unknown) {
    const input = zodParse(CreateProjectSchema, body);
    return this.projects.create(orgId, input);
  }

  @Get("v1/orgs/:orgId/projects")
  @RequirePermission("project.list")
  async list(
    @Param("orgId") orgId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("trash") trash?: string,
  ) {
    const page = zodParse(CursorPageParamsSchema, {
      cursor,
      ...(limit !== undefined && { limit: Number(limit) }),
    });
    return this.projects.list(orgId, {
      cursor: page.cursor,
      limit: page.limit,
      trash: trash === "true",
    });
  }

  @Get("v1/projects/:projectId")
  @RequirePermission("project.read")
  async get(@Param("projectId") projectId: string) {
    return this.projects.get(projectId);
  }

  @Patch("v1/projects/:projectId")
  @RequirePermission("project.update")
  async patch(@Param("projectId") projectId: string, @Body() body: unknown) {
    const input = zodParse(PatchProjectSchema, body);
    return this.projects.patch(projectId, input);
  }

  @Delete("v1/projects/:projectId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("project.delete")
  async softDelete(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ) {
    await this.projects.softDelete(projectId, req.user!.sub);
  }

  @Post("v1/projects/:projectId/restore")
  @RequirePermission("project.delete")
  async restore(@Param("projectId") projectId: string, @Req() req: Request) {
    return this.projects.restore(projectId, req.user!.sub);
  }
}
