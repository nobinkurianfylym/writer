import { loadDotEnvIfPresent, reportEnvErrorAndExit } from "@fylym/config/env";
import { getWorkerEnv, type WorkerEnv } from "./env.js";
import {
  createConnection,
  createDeadLetterQueue,
} from "./queue.js";
import { createExportWorker } from "./worker.js";
import type { AlertHook } from "./dlq.js";

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

  const worker = createExportWorker({ connection, deadLetter, alert, env });

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
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main();
