import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CreateExportSchema } from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { ExportsService } from "./exports.service";

@Controller()
@UseGuards(JwtGuard, RbacGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post("v1/scripts/:scriptId/exports")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("script.export")
  async requestExport(
    @Param("scriptId") scriptId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = zodParse(CreateExportSchema, body);
    return this.exports.requestExport(scriptId, req.user!.sub, input);
  }
}
