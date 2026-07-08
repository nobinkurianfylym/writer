import { loadDotEnvIfPresent, reportEnvErrorAndExit } from "@fylym/config/env";
import { getWorkerEnv } from "./env.js";

function main() {
  loadDotEnvIfPresent();

  let env;
  try {
    env = getWorkerEnv();
  } catch (error) {
    reportEnvErrorAndExit(error);
  }

  console.log(`[worker] booted, redis=${env.REDIS_URL}`);

  // The BullMQ job pattern (queues, processors, DLQ) lands in E5-1.
  // Keep the process alive so `pnpm dev` behaves like a long-running service.
  setInterval(() => {}, 1 << 30);
}

main();
