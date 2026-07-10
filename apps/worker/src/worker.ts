import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { EXPORT_QUEUE, type JobData } from "@fylym/contracts";
import type { WorkerEnv } from "./env.js";
import { runDemoJob } from "./processors/demo.js";
import {
  handleFailedJob,
  type AlertHook,
  type DeadLetterSink,
} from "./dlq.js";

export interface WorkerDeps {
  connection: Redis;
  deadLetter: DeadLetterSink;
  alert: AlertHook;
  env: WorkerEnv;
}

/** Route a job to its processor by kind. */
export async function processJob(job: Job<JobData>): Promise<unknown> {
  const data = job.data;
  switch (data.kind) {
    case "demo":
      return runDemoJob(data, job);
    case "export":
    case "derive":
      // Real processors land in E5-2 / E5-3.
      throw new Error(`No processor registered for kind: ${data.kind}`);
    default:
      throw new Error("Unknown job kind");
  }
}

export function createExportWorker(deps: WorkerDeps): Worker<JobData> {
  const worker = new Worker<JobData>(EXPORT_QUEUE, processJob, {
    connection: deps.connection,
    concurrency: 4,
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    void handleFailedJob(
      {
        id: job.id,
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: err?.message ?? job.failedReason,
        opts: { attempts: job.opts.attempts },
      },
      deps.deadLetter,
      deps.alert,
    );
  });

  return worker;
}
