import { loadDotEnvIfPresent, reportEnvErrorAndExit } from "@fylym/config/env";
import { createPrismaClient } from "@fylym/db";
import { initTelemetry } from "./telemetry.js";
import { getWorkerEnv, type WorkerEnv } from "./env.js";

// Start tracing before anything else so auto-instrumentation hooks in early.
initTelemetry("fylym-worker");
import {
  createConnection,
  createDeadLetterQueue,
} from "./queue.js";
import { createExportWorker } from "./worker.js";
import { createS3Client, createArtifactStore, s3ConfigFromEnv } from "./s3.js";
import type { AlertHook } from "./dlq.js";
import type { ScriptStateReader } from "./processors/export-job.js";
import type { SceneIndexWriter } from "./processors/derive-job.js";

function main() {
  loadDotEnvIfPresent();

  let env: WorkerEnv;
  try {
    env = getWorkerEnv();
  } catch (error) {
    reportEnvErrorAndExit(error);
    return;
  }

  const connection = createConnection(env);
  const deadLetter = createDeadLetterQueue(connection);

  const alert: AlertHook = (a) => {
    // Prod wires this to paging (PagerDuty/Opsgenie). Locally we log loudly.
    console.error(
      `[worker][ALERT] job ${a.jobId} (${a.jobName}) dead-lettered after ${a.attemptsMade} attempts: ${a.reason}`,
    );
  };

  const prisma = createPrismaClient(env.DATABASE_URL);
  const s3Config = s3ConfigFromEnv(env);
  const store = createArtifactStore(createS3Client(s3Config), s3Config);

  const worker = createExportWorker({
    connection,
    deadLetter,
    alert,
    env,
    exportDeps: { db: prisma as unknown as ScriptStateReader, store },
    deriveDeps: { db: prisma as unknown as SceneIndexWriter },
  });

  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });
  worker.on("ready", () => {
    console.log(`[worker] ready, consuming from redis=${env.REDIS_URL}`);
  });

  const shutdown = async () => {
    console.log("[worker] shutting down");
    await worker.close();
    await deadLetter.close();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main();
