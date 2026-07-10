import type { DemoJobData } from "@fylym/contracts";

export interface ProgressReporter {
  updateProgress(progress: number): Promise<void>;
}

/**
 * A trivial processor that walks progress 0 → 100 in even steps. Used to
 * prove the pipeline end-to-end; real export processors arrive in E5-2.
 * When `crash` is set it throws, exercising the retry + DLQ path.
 */
export async function runDemoJob(
  data: DemoJobData,
  job: ProgressReporter,
): Promise<{ ok: true }> {
  const steps = data.steps ?? 4;

  await job.updateProgress(0);
  for (let i = 1; i <= steps; i++) {
    if (data.crash) {
      throw new Error("demo job crashed on purpose");
    }
    await job.updateProgress(Math.round((i / steps) * 100));
  }

  return { ok: true };
}
