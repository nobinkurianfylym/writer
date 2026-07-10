import type { Job as ContractJob, JobStatus } from "@fylym/contracts";

/**
 * Minimal shape we read off a BullMQ job — declared locally so this module
 * (and its tests) don't need a live queue.
 */
/** BullMQ's JobProgress is a wide union; we only make sense of numbers. */
export type JobProgressLike = number | object | string | boolean;

export interface BullJobLike {
  id?: string;
  progress: JobProgressLike;
  returnvalue?: unknown;
  failedReason?: string;
  finishedOn?: number;
  processedOn?: number;
  attemptsMade: number;
  getState?: () => Promise<string>;
}

/** BullMQ exposes many states; collapse them to the four contract states. */
export function mapBullState(state: string): JobStatus {
  switch (state) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "active":
      return "active";
    // waiting, delayed, waiting-children, prioritized, unknown → queued
    default:
      return "queued";
  }
}

/**
 * Never leak stack traces or internal error text to clients. Failed jobs
 * report a single safe, generic message.
 */
export function safeFailureMessage(): string {
  return "The job failed to complete. Please try again or contact support.";
}

function numericProgress(progress: JobProgressLike): number {
  if (typeof progress === "number") {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }
  return 0;
}

export function mapJobToContract(
  job: BullJobLike,
  state: JobStatus,
  resultUrl: string | null,
): ContractJob {
  const isFailed = state === "failed";
  return {
    id: job.id ?? "",
    status: state,
    progress: state === "completed" ? 100 : numericProgress(job.progress),
    resultUrl: state === "completed" ? resultUrl : null,
    error: isFailed ? safeFailureMessage() : null,
  };
}
