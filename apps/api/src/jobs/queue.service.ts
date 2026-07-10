import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Queue, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { EXPORT_QUEUE, type JobData } from "@fylym/contracts";
import { getApiEnv } from "../env";

/**
 * Owns the producer side of the BullMQ pipeline: the API enqueues jobs the
 * worker consumes, and reads job state back for GET /v1/jobs/:id.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection!: Redis;
  private queue!: Queue<JobData>;

  onModuleInit() {
    const env = getApiEnv();
    this.connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<JobData>(EXPORT_QUEUE, {
      connection: this.connection,
    });
    this.logger.log("Export queue ready");
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(name: string, data: JobData): Promise<string> {
    const job = await this.queue.add(name, data);
    return job.id ?? "";
  }

  async getJob(jobId: string): Promise<BullJob<JobData> | undefined> {
    return this.queue.getJob(jobId);
  }
}
