import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { OrgList } from "@fylym/contracts";
import { JwtGuard } from "../auth/jwt.guard";
import { OrgService } from "./org.service";

@Controller()
@UseGuards(JwtGuard)
export class OrgController {
  constructor(private readonly orgs: OrgService) {}

  @Get("v1/orgs")
  async list(@Req() req: Request): Promise<OrgList> {
    const items = await this.orgs.listForUser(req.user!.sub);
    return { items };
  }
}
