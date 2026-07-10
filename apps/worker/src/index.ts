// Library surface: pure helpers and factories reused by the API service.
export { getWorkerEnv, type WorkerEnv } from "./env.js";
export {
  createS3Client,
  createArtifactStore,
  type ArtifactStore,
  type S3Config,
} from "./s3.js";
export {
  getPresignedUrlExpiry,
  isPresignedUrlExpired,
  parseAmzDate,
  type PresignExpiry,
} from "./signed-url.js";
export {
  mapBullState,
  mapJobToContract,
  safeFailureMessage,
  type BullJobLike,
} from "./job-status.js";
export {
  handleFailedJob,
  type AlertHook,
  type DeadLetterSink,
  type FailedJobLike,
} from "./dlq.js";
export { runDemoJob, type ProgressReporter } from "./processors/demo.js";
export {
  runExportJob,
  type ExportProcessorDeps,
  type ScriptStateReader,
} from "./processors/export-job.js";
export {
  runExport,
  resolveProfile,
  type ExportArtifact,
  type ExportRunOptions,
} from "./export.js";
export {
  createConnection,
  createExportQueue,
  createDeadLetterQueue,
} from "./queue.js";
export {
  createExportWorker,
  makeProcessJob,
  type WorkerDeps,
} from "./worker.js";
