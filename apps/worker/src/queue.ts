import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { EXPORT_QUEUE, DEAD_LETTER_QUEUE } from "@fylym/contracts";
import type { WorkerEnv } from "./env.js";

export function createConnection(env: WorkerEnv): Redis {
  // BullMQ requires maxRetriesPerRequest: null on the blocking connection.
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export function createExportQueue(connection: Redis, env: WorkerEnv): Queue {
  return new Queue(EXPORT_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: env.JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: false,
    },
  });
}

export function createDeadLetterQueue(connection: Redis): Queue {
  return new Queue(DEAD_LETTER_QUEUE, { connection });
}
