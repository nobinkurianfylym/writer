import { z } from "zod";
import { registry } from "./registry.js";

/* ── Shared queue identity (API produces, worker consumes) ── */

// BullMQ 5 forbids ":" in queue names (it partitions Redis keys by colon).
export const EXPORT_QUEUE = "fylym-export";
export const DEAD_LETTER_QUEUE = "fylym-dead-letter";

export const JOB_KINDS = ["export", "derive", "demo"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** Payload enqueued for an export job (E5-2 fills in the processor). */
export interface ExportJobData {
  kind: "export";
  scriptId: string;
  format: "pdf" | "fdx" | "fountain";
  options?: {
    sceneNumbers?: boolean;
    watermark?: string;
    titlePage?: boolean;
  };
  requestedBy: string;
}

/** Payload for the SceneIndex derive job (E5-3). */
export interface DeriveJobData {
  kind: "derive";
  scriptId: string;
}

/** A trivial job used to exercise the pipeline in tests. */
export interface DemoJobData {
  kind: "demo";
  steps?: number;
  crash?: boolean;
}

export type JobData = ExportJobData | DeriveJobData | DemoJobData;

/** Value a processor returns on success; the artifact lives in S3. */
export interface JobResult {
  s3Key: string;
  contentType: string;
  byteLength: number;
}

/* ── HTTP contract for GET /v1/jobs/:jobId ── */

export const JobStatusSchema = registry.register(
  "JobStatus",
  z.enum(["queued", "active", "completed", "failed"]).openapi("JobStatus"),
);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = registry.register(
  "Job",
  z
    .object({
      id: z.string(),
      status: JobStatusSchema,
      progress: z.number().int().min(0).max(100),
      resultUrl: z.string().url().nullable(),
      error: z.string().nullable(),
    })
    .openapi("Job"),
);

export type Job = z.infer<typeof JobSchema>;
