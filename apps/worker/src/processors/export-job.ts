import { hydrateFromYUpdate } from "@fylym/editor/headless";
import type { ExportJobData, JobResult } from "@fylym/contracts";
import { runExport, resolveProfile } from "../export.js";
import type { ProgressReporter } from "./demo.js";
import type { ArtifactStore } from "../s3.js";

/** The slice of Prisma the export processor needs (mockable in tests). */
export interface ScriptStateReader {
  script: {
    findUnique(args: {
      where: { id: string };
      select: { ydocState: boolean; formatProfile: boolean; deletedAt: boolean };
    }): Promise<{
      ydocState: Uint8Array | null;
      formatProfile: string;
      deletedAt: Date | null;
    } | null>;
  };
}

export interface ExportProcessorDeps {
  db: ScriptStateReader;
  store: ArtifactStore;
}

/**
 * Load a script's persisted Yjs state, hydrate it to a screenplay document,
 * run the shared export pipeline, and store the artifact in S3. Returns the
 * S3 key so the API can mint a fresh signed URL when the job is polled.
 */
export async function runExportJob(
  data: ExportJobData,
  job: ProgressReporter,
  deps: ExportProcessorDeps,
): Promise<JobResult> {
  await job.updateProgress(5);

  const script = await deps.db.script.findUnique({
    where: { id: data.scriptId },
    select: { ydocState: true, formatProfile: true, deletedAt: true },
  });

  if (!script || script.deletedAt) {
    throw new Error(`Script not found: ${data.scriptId}`);
  }
  if (!script.ydocState) {
    throw new Error(`Script has no stored state: ${data.scriptId}`);
  }

  await job.updateProgress(25);
  const { document } = hydrateFromYUpdate(new Uint8Array(script.ydocState));

  await job.updateProgress(50);
  const profile = resolveProfile(script.formatProfile);
  const artifact = await runExport(
    document,
    data.format,
    profile,
    data.options ?? {},
  );

  await job.updateProgress(80);
  const key = `exports/${data.scriptId}/${Date.now()}.${artifact.extension}`;
  await deps.store.put(key, artifact.bytes, artifact.contentType);

  await job.updateProgress(100);
  return {
    s3Key: key,
    contentType: artifact.contentType,
    byteLength: artifact.bytes.byteLength,
  };
}
