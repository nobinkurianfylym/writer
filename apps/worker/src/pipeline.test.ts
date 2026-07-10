import { describe, it, expect, vi } from "vitest";
import type { DemoJobData, JobData } from "@fylym/contracts";
import { runDemoJob, type ProgressReporter } from "./processors/demo.js";
import {
  mapBullState,
  mapJobToContract,
  safeFailureMessage,
} from "./job-status.js";
import {
  handleFailedJob,
  type DeadLetterSink,
  type FailedJobLike,
} from "./dlq.js";
import { createS3Client, createArtifactStore, type S3Config } from "./s3.js";
import { getPresignedUrlExpiry, isPresignedUrlExpired } from "./signed-url.js";

/* ── progress 0 → 100 ── */

class RecordingReporter implements ProgressReporter {
  readonly values: number[] = [];
  async updateProgress(progress: number) {
    this.values.push(progress);
  }
}

describe("demo processor progress", () => {
  it("reports progress from 0 to 100 monotonically", async () => {
    const reporter = new RecordingReporter();
    const result = await runDemoJob({ kind: "demo", steps: 5 }, reporter);

    expect(result).toEqual({ ok: true });
    expect(reporter.values[0]).toBe(0);
    expect(reporter.values.at(-1)).toBe(100);

    // strictly non-decreasing
    for (let i = 1; i < reporter.values.length; i++) {
      expect(reporter.values[i]!).toBeGreaterThanOrEqual(reporter.values[i - 1]!);
    }
  });

  it("throws when instructed to crash", async () => {
    const reporter = new RecordingReporter();
    await expect(
      runDemoJob({ kind: "demo", crash: true } as DemoJobData, reporter),
    ).rejects.toThrow("crashed on purpose");
  });
});

/* ── job status mapping ── */

describe("job status mapping", () => {
  it("collapses BullMQ states to the four contract states", () => {
    expect(mapBullState("waiting")).toBe("queued");
    expect(mapBullState("delayed")).toBe("queued");
    expect(mapBullState("active")).toBe("active");
    expect(mapBullState("completed")).toBe("completed");
    expect(mapBullState("failed")).toBe("failed");
  });

  it("surfaces progress for active jobs", () => {
    const job = mapJobToContract(
      { progress: 42, attemptsMade: 1 },
      "active",
      null,
    );
    expect(job.status).toBe("active");
    expect(job.progress).toBe(42);
    expect(job.resultUrl).toBeNull();
    expect(job.error).toBeNull();
  });

  it("forces progress to 100 and attaches result URL when completed", () => {
    const job = mapJobToContract(
      { progress: 90, attemptsMade: 1 },
      "completed",
      "https://s3/signed",
    );
    expect(job.progress).toBe(100);
    expect(job.resultUrl).toBe("https://s3/signed");
  });

  it("returns a safe generic message for failed jobs and hides internals", () => {
    const job = mapJobToContract(
      {
        progress: 10,
        attemptsMade: 3,
        failedReason: "TypeError: cannot read property x of undefined at /src/secret.ts:42",
      },
      "failed",
      null,
    );
    expect(job.status).toBe("failed");
    expect(job.error).toBe(safeFailureMessage());
    expect(job.error).not.toContain("secret.ts");
    expect(job.resultUrl).toBeNull();
  });
});

/* ── DLQ + alerting ── */

function failedJob(overrides: Partial<FailedJobLike> = {}): FailedJobLike {
  return {
    id: "job-1",
    name: "demo",
    data: { kind: "demo" } as JobData,
    attemptsMade: 3,
    failedReason: "boom",
    opts: { attempts: 3 },
    ...overrides,
  };
}

describe("dead-letter routing", () => {
  it("dead-letters an exhausted job and fires the alert hook", async () => {
    const add = vi.fn().mockResolvedValue({});
    const dlq: DeadLetterSink = { add };
    const alert = vi.fn();

    const routed = await handleFailedJob(failedJob(), dlq, alert);

    expect(routed).toBe(true);
    expect(add).toHaveBeenCalledWith(
      "dead-letter",
      expect.objectContaining({ originalJobId: "job-1", failedReason: "boom" }),
    );
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", jobName: "demo", reason: "boom" }),
    );
  });

  it("does not dead-letter a job with retries remaining", async () => {
    const add = vi.fn().mockResolvedValue({});
    const alert = vi.fn();

    const routed = await handleFailedJob(
      failedJob({ attemptsMade: 1, opts: { attempts: 3 } }),
      { add },
      alert,
    );

    expect(routed).toBe(false);
    expect(add).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});

/* ── signed URL expiry (clock-controlled) ── */

const s3Config: S3Config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "fylym-exports",
  accessKeyId: "fylym",
  secretAccessKey: "fylym-dev-secret",
  forcePathStyle: true,
  signedUrlTtlSec: 300,
};

describe("presigned URL expiry", () => {
  it("embeds a short TTL and is judged expired only after it elapses", async () => {
    const store = createArtifactStore(createS3Client(s3Config), s3Config);
    const url = await store.signedDownloadUrl("exports/script-1.pdf", 300);

    const { signedAt, expiresAt } = getPresignedUrlExpiry(url);
    expect(expiresAt - signedAt).toBe(300 * 1000);

    // Fresh: not expired right after signing.
    expect(isPresignedUrlExpired(url, signedAt + 1_000)).toBe(false);
    // One second before expiry: still valid.
    expect(isPresignedUrlExpired(url, expiresAt - 1_000)).toBe(false);
    // At/after expiry: rejected.
    expect(isPresignedUrlExpired(url, expiresAt)).toBe(true);
    expect(isPresignedUrlExpired(url, expiresAt + 60_000)).toBe(true);
  });

  it("uses the configured default TTL when none is passed", async () => {
    const store = createArtifactStore(createS3Client(s3Config), s3Config);
    const url = await store.signedDownloadUrl("exports/script-2.fdx");
    const { signedAt, expiresAt } = getPresignedUrlExpiry(url);
    expect(expiresAt - signedAt).toBe(300 * 1000);
  });
});
