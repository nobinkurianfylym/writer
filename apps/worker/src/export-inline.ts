import { hydrateFromYUpdate } from "@fylym/editor/headless";
import type { ExportFormat } from "@fylym/contracts";
import {
  runExport,
  resolveProfile,
  type ExportArtifact,
  type ExportRunOptions,
} from "./export.js";

/**
 * Hydrate a script's persisted Yjs state and run the shared export pipeline
 * in-process. Used by the API to stream a finished export straight to the
 * browser as a download — no background worker, no object storage.
 */
export async function exportFromYState(
  ydocState: Uint8Array,
  formatProfile: string | undefined,
  format: ExportFormat,
  options: ExportRunOptions = {},
): Promise<ExportArtifact> {
  const { document } = hydrateFromYUpdate(ydocState);
  const profile = resolveProfile(formatProfile);
  return runExport(document, format, profile, options);
}
