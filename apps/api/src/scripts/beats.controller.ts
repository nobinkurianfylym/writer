import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { BeatsSchema } from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { zodParse } from "../common/zod";
import { BeatsService } from "./beats.service";

// The beat board is script planning content, so it reuses the same read/write
// permissions as the screenplay state.
@Controller()
@UseGuards(JwtGuard, RbacGuard)
export class BeatsController {
  constructor(private readonly beats: BeatsService) {}

  @Get("v1/scripts/:scriptId/beats")
  @RequirePermission("script.state.read")
  getBeats(@Param("scriptId") scriptId: string) {
    return this.beats.getBeats(scriptId);
  }

  @Put("v1/scripts/:scriptId/beats")
  @RequirePermission("script.state.write")
  putBeats(@Param("scriptId") scriptId: string, @Body() body: unknown) {
    const input = zodParse(BeatsSchema, body);
    return this.beats.putBeats(scriptId, input);
  }
}
