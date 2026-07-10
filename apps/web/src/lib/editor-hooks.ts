"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SnapshotPage,
  Snapshot,
  ExportFormat,
  ExportOptions,
  ExportAccepted,
  Job,
} from "@fylym/contracts";
import { useSession } from "./session";

export const editorQk = {
  snapshots: (scriptId: string) => ["snapshots", scriptId] as const,
};

export function useSnapshots(scriptId: string) {
  const { apiRequest } = useSession();
  return useQuery({
    queryKey: editorQk.snapshots(scriptId),
    queryFn: () =>
      apiRequest<SnapshotPage>(`/v1/scripts/${scriptId}/snapshots`),
    select: (data) => data.items,
  });
}

export function useCreateSnapshot(scriptId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) =>
      apiRequest<Snapshot>(`/v1/scripts/${scriptId}/snapshots`, {
        method: "POST",
        body: label ? { label } : {},
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: editorQk.snapshots(scriptId) });
    },
  });
}

export function useRestoreSnapshot(scriptId: string) {
  const { apiRequest } = useSession();
  return useMutation({
    mutationFn: (snapshotId: string) =>
      apiRequest<Snapshot>(
        `/v1/scripts/${scriptId}/snapshots/${snapshotId}/restore`,
        { method: "POST" },
      ),
  });
}

/**
 * Requests an export, polls the job to completion, and resolves with the
 * signed download URL. `onProgress` fires with 0–100 as the job advances.
 */
export function useExport(scriptId: string) {
  const { apiRequest } = useSession();

  return useMutation({
    mutationFn: async (args: {
      format: ExportFormat;
      options?: ExportOptions;
      onProgress?: (progress: number) => void;
    }) => {
      const { jobId } = await apiRequest<ExportAccepted>(
        `/v1/scripts/${scriptId}/exports`,
        { method: "POST", body: { format: args.format, options: args.options } },
      );

      // Poll the job until it completes or fails.
      for (let i = 0; i < 120; i++) {
        const job = await apiRequest<Job>(`/v1/jobs/${jobId}`);
        args.onProgress?.(job.progress);
        if (job.status === "completed" && job.resultUrl) {
          return { url: job.resultUrl };
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "Export failed");
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("Export timed out");
    },
  });
}
