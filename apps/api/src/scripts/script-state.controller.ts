import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  PutScriptStateSchema,
  CreateSnapshotSchema,
  CursorPageParamsSchema,
} from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { ScriptStateService } from "./script-state.service";
import { SnapshotsService } from "./snapshots.service";

@Controller()
@UseGuards(JwtGuard, RbacGuard)
export class ScriptStateController {
  constructor(
    private readonly state: ScriptStateService,
    private readonly snapshots: SnapshotsService,
  ) {}

  @Put("v1/scripts/:scriptId/state")
  @RequirePermission("script.state.write")
  async putState(@Param("scriptId") scriptId: string, @Body() body: unknown) {
    const input = zodParse(PutScriptStateSchema, body);
    return this.state.putState(scriptId, input);
  }

  @Get("v1/scripts/:scriptId/state")
  @RequirePermission("script.state.read")
  async getState(@Param("scriptId") scriptId: string) {
    return this.state.getState(scriptId);
  }

  @Post("v1/scripts/:scriptId/snapshots")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("script.snapshot.create")
  async createSnapshot(
    @Param("scriptId") scriptId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = zodParse(CreateSnapshotSchema, body);
    return this.snapshots.create(scriptId, req.user!.sub, input);
  }

  @Get("v1/scripts/:scriptId/snapshots")
  @RequirePermission("script.snapshot.list")
  async listSnapshots(
    @Param("scriptId") scriptId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const page = zodParse(CursorPageParamsSchema, {
      cursor,
      ...(limit !== undefined && { limit: Number(limit) }),
    });
    return this.snapshots.list(scriptId, {
      cursor: page.cursor,
      limit: page.limit,
    });
  }

  @Post("v1/scripts/:scriptId/snapshots/:snapshotId/restore")
  @RequirePermission("script.snapshot.restore")
  async restoreSnapshot(
    @Param("scriptId") scriptId: string,
    @Param("snapshotId") snapshotId: string,
    @Req() req: Request,
  ) {
    return this.snapshots.restore(scriptId, snapshotId, req.user!.sub);
  }
}
