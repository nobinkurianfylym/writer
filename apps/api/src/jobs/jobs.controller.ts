import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { JobsService } from "./jobs.service";

@Controller()
@UseGuards(JwtGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get("v1/jobs/:jobId")
  async getJob(@Param("jobId") jobId: string) {
    return this.jobs.getJob(jobId);
  }
}
