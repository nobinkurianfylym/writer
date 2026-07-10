import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { EXPORT_QUEUE, type JobData } from "@fylym/contracts";
import type { WorkerEnv } from "./env.js";
import { runDemoJob } from "./processors/demo.js";
import {
  runExportJob,
  type ExportProcessorDeps,
} from "./processors/export-job.js";
import {
  runDeriveJob,
  type DeriveProcessorDeps,
} from "./processors/derive-job.js";
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
  /** Provides DB + S3 for export jobs; omit to run a demo-only worker. */
  exportDeps?: ExportProcessorDeps;
  /** Provides DB for SceneIndex derive jobs; omit to skip derive support. */
  deriveDeps?: DeriveProcessorDeps;
}

/**
 * Build the kind-routed processor. Export jobs require DB + S3 deps; when
 * absent (e.g. a demo-only worker) they fail fast rather than silently.
 */
export function makeProcessJob(
  exportDeps?: ExportProcessorDeps,
  deriveDeps?: DeriveProcessorDeps,
): (job: Job<JobData>) => Promise<unknown> {
  return async (job) => {
    const data = job.data;
    switch (data.kind) {
      case "demo":
        return runDemoJob(data, job);
      case "export":
        if (!exportDeps) {
          throw new Error("Export processor is not configured");
        }
        return runExportJob(data, job, exportDeps);
      case "derive":
        if (!deriveDeps) {
          throw new Error("Derive processor is not configured");
        }
        return runDeriveJob(data, job, deriveDeps);
      default:
        throw new Error("Unknown job kind");
    }
  };
}

export function createExportWorker(deps: WorkerDeps): Worker<JobData> {
  const worker = new Worker<JobData>(
    EXPORT_QUEUE,
    makeProcessJob(deps.exportDeps, deps.deriveDeps),
    {
      connection: deps.connection,
      concurrency: 4,
    },
  );

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
