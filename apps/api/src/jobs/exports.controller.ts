import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CreateExportSchema } from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RateLimitGuard } from "../auth/rate-limit.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { ExportsService } from "./exports.service";

// Exports are expensive (worker + S3), so the endpoint carries its own
// per-IP rate-limit bucket on top of auth (§9 stricter export budget).
@Controller()
@UseGuards(JwtGuard, RbacGuard, RateLimitGuard)
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

  // Synchronous export: renders the file in-process and streams it straight
  // back as a download. No worker or object storage — the browser saves it
  // to the user's machine.
  @Post("v1/scripts/:scriptId/export")
  @RequirePermission("script.export")
  async exportInline(
    @Param("scriptId") scriptId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const input = zodParse(CreateExportSchema, body);
    const artifact = await this.exports.exportInline(
      scriptId,
      req.user!.sub,
      input,
    );
    res
      .status(HttpStatus.OK)
      .setHeader("Content-Type", artifact.contentType)
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${artifact.filename}"`,
      )
      .send(Buffer.from(artifact.bytes));
  }
}
