import { Injectable, NotFoundException } from "@nestjs/common";
import type { Job, JobResult } from "@fylym/contracts";
import { mapBullState, mapJobToContract } from "@fylym/worker";
import { QueueService } from "./queue.service";
import { S3Service } from "./s3.service";

@Injectable()
export class JobsService {
  constructor(
    private readonly queue: QueueService,
    private readonly s3: S3Service,
  ) {}

  async getJob(jobId: string): Promise<Job> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    const state = mapBullState(await job.getState());

    let resultUrl: string | null = null;
    if (state === "completed" && this.isJobResult(job.returnvalue)) {
      resultUrl = await this.s3.signedDownloadUrl(job.returnvalue.s3Key);
    }

    return mapJobToContract(
      {
        id: job.id,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      },
      state,
      resultUrl,
    );
  }

  private isJobResult(value: unknown): value is JobResult {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as JobResult).s3Key === "string"
    );
  }
}
