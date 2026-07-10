import type { JobData } from "@fylym/contracts";

/** A hook fired when a job permanently fails — wire to paging in prod. */
export type AlertHook = (alert: {
  jobId: string;
  jobName: string;
  attemptsMade: number;
  reason: string;
}) => void | Promise<void>;

/** The subset of a dead-letter queue we depend on (mockable in tests). */
export interface DeadLetterSink {
  add(
    name: string,
    data: { originalJobId: string; data: JobData; failedReason: string },
  ): Promise<unknown>;
}

export interface FailedJobLike {
  id?: string;
  name: string;
  data: JobData;
  attemptsMade: number;
  failedReason?: string;
  opts: { attempts?: number };
}

/**
 * Called on every job failure. A job is only dead-lettered once its retries
 * are exhausted; transient failures that will be retried are left alone.
 * Returns true when the job was routed to the DLQ.
 */
export async function handleFailedJob(
  job: FailedJobLike,
  dlq: DeadLetterSink,
  alert: AlertHook,
): Promise<boolean> {
  const maxAttempts = job.opts.attempts ?? 1;
  const exhausted = job.attemptsMade >= maxAttempts;
  if (!exhausted) {
    return false;
  }

  const reason = job.failedReason ?? "unknown";

  await dlq.add("dead-letter", {
    originalJobId: job.id ?? "",
    data: job.data,
    failedReason: reason,
  });

  await alert({
    jobId: job.id ?? "",
    jobName: job.name,
    attemptsMade: job.attemptsMade,
    reason,
  });

  return true;
}
