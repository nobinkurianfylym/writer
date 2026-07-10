import { describe, it, expect, vi } from "vitest";
import { JobsService } from "./jobs.service";
import type { QueueService } from "./queue.service";
import type { S3Service } from "./s3.service";

function createService(bullJob: unknown, signedUrl = "https://s3/signed-url") {
  const queue = {
    getJob: vi.fn().mockResolvedValue(bullJob),
  } as unknown as QueueService;
  const s3 = {
    signedDownloadUrl: vi.fn().mockResolvedValue(signedUrl),
  } as unknown as S3Service;
  return { service: new JobsService(queue, s3), queue, s3 };
}

describe("JobsService", () => {
  it("returns 404 when the job is unknown", async () => {
    const { service } = createService(undefined);
    await expect(service.getJob("missing")).rejects.toThrow("Job not found");
  });

  it("maps an active job with progress and no result URL", async () => {
    const { service, s3 } = createService({
      id: "job-1",
      progress: 55,
      attemptsMade: 1,
      getState: vi.fn().mockResolvedValue("active"),
    });

    const job = await service.getJob("job-1");
    expect(job).toEqual({
      id: "job-1",
      status: "active",
      progress: 55,
      resultUrl: null,
      error: null,
    });
    expect(s3.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("mints a signed URL for a completed job with a result", async () => {
    const { service, s3 } = createService({
      id: "job-2",
      progress: 100,
      attemptsMade: 1,
      returnvalue: { s3Key: "exports/job-2.pdf", contentType: "application/pdf", byteLength: 10 },
      getState: vi.fn().mockResolvedValue("completed"),
    });

    const job = await service.getJob("job-2");
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
    expect(job.resultUrl).toBe("https://s3/signed-url");
    expect(s3.signedDownloadUrl).toHaveBeenCalledWith("exports/job-2.pdf");
  });

  it("reports a failed job with a safe message and no result", async () => {
    const { service, s3 } = createService({
      id: "job-3",
      progress: 20,
      attemptsMade: 3,
      failedReason: "Error: internal stack trace at /src/secret.ts",
      getState: vi.fn().mockResolvedValue("failed"),
    });

    const job = await service.getJob("job-3");
    expect(job.status).toBe("failed");
    expect(job.error).toBeTruthy();
    expect(job.error).not.toContain("secret.ts");
    expect(job.resultUrl).toBeNull();
    expect(s3.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not mint a URL when a completed job lacks a result payload", async () => {
    const { service, s3 } = createService({
      id: "job-4",
      progress: 100,
      attemptsMade: 1,
      returnvalue: { ok: true },
      getState: vi.fn().mockResolvedValue("completed"),
    });

    const job = await service.getJob("job-4");
    expect(job.status).toBe("completed");
    expect(job.resultUrl).toBeNull();
    expect(s3.signedDownloadUrl).not.toHaveBeenCalled();
  });
});
