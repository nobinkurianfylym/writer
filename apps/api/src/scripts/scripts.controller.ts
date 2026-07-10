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
  CreateScriptSchema,
  PatchScriptSchema,
  CursorPageParamsSchema,
} from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { ScriptsService } from "./scripts.service";

@Controller()
@UseGuards(JwtGuard, RbacGuard)
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Post("v1/projects/:projectId/scripts")
  @RequirePermission("script.create")
  async create(@Param("projectId") projectId: string, @Body() body: unknown) {
    const input = zodParse(CreateScriptSchema, body);
    return this.scripts.create(projectId, input);
  }

  @Get("v1/projects/:projectId/scripts")
  @RequirePermission("script.list")
  async list(
    @Param("projectId") projectId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("trash") trash?: string,
  ) {
    const page = zodParse(CursorPageParamsSchema, {
      cursor,
      ...(limit !== undefined && { limit: Number(limit) }),
    });
    return this.scripts.list(projectId, {
      cursor: page.cursor,
      limit: page.limit,
      trash: trash === "true",
    });
  }

  @Get("v1/scripts/:scriptId")
  @RequirePermission("script.read")
  async get(@Param("scriptId") scriptId: string) {
    return this.scripts.get(scriptId);
  }

  @Patch("v1/scripts/:scriptId")
  @RequirePermission("script.update")
  async patch(@Param("scriptId") scriptId: string, @Body() body: unknown) {
    const input = zodParse(PatchScriptSchema, body);
    return this.scripts.patch(scriptId, input);
  }

  @Delete("v1/scripts/:scriptId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("script.delete")
  async softDelete(@Param("scriptId") scriptId: string, @Req() req: Request) {
    await this.scripts.softDelete(scriptId, req.user!.sub);
  }

  @Post("v1/scripts/:scriptId/restore")
  @RequirePermission("script.delete")
  async restore(@Param("scriptId") scriptId: string, @Req() req: Request) {
    return this.scripts.restore(scriptId, req.user!.sub);
  }
}
