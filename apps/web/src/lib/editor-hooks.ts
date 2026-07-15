"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SnapshotPage,
  Snapshot,
  ExportFormat,
  ExportOptions,
  Beat,
  Beats,
} from "@fylym/contracts";
import { useSession } from "./session";
import { API_URL } from "./api-client";

export const editorQk = {
  snapshots: (scriptId: string) => ["snapshots", scriptId] as const,
  beats: (scriptId: string) => ["beats", scriptId] as const,
};

/**
 * Returns a Manglish IME candidate fetcher backed by the API's Google Input
 * Tools proxy. On any failure the editor falls back to its offline rule-based
 * transliterator.
 */
const transliterateCache = new Map<string, string[]>();

export function useTransliterate() {
  const { apiRequest } = useSession();
  return useCallback(
    async (latin: string): Promise<string[]> => {
      const cached = transliterateCache.get(latin);
      if (cached) return cached;
      const res = await apiRequest<{ candidates: string[] }>(
        `/v1/transliterate?text=${encodeURIComponent(latin)}`,
      );
      if (res.candidates.length > 0) {
        if (transliterateCache.size > 3000) transliterateCache.clear();
        transliterateCache.set(latin, res.candidates);
      }
      return res.candidates;
    },
    [apiRequest],
  );
}

/** Loads a script's beat board. */
export function useBeats(scriptId: string) {
  const { apiRequest } = useSession();
  return useQuery({
    queryKey: editorQk.beats(scriptId),
    queryFn: () => apiRequest<Beats>(`/v1/scripts/${scriptId}/beats`),
    select: (data) => data.beats,
  });
}

/** Replaces the whole beat board (the board autosaves the full list). */
export function useSaveBeats(scriptId: string) {
  const { apiRequest } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (beats: Beat[]) =>
      apiRequest<Beats>(`/v1/scripts/${scriptId}/beats`, {
        method: "PUT",
        body: { beats },
      }),
    onSuccess: (data) => {
      client.setQueryData(editorQk.beats(scriptId), data);
    },
  });
}

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
 * Renders an export server-side (in-process) and resolves with the file
 * blob + a suggested filename, ready to save straight to the user's machine.
 */
export function useExport(scriptId: string) {
  const { getAccessToken } = useSession();

  return useMutation({
    mutationFn: async (args: {
      format: ExportFormat;
      options?: ExportOptions;
    }): Promise<{ blob: Blob; filename: string }> => {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/v1/scripts/${scriptId}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ format: args.format, options: args.options }),
      });

      if (!res.ok) {
        let message = "Export failed";
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // non-JSON error body; keep the generic message
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const filename = match?.[1] ?? `screenplay.${args.format}`;
      return { blob, filename };
    },
  });
}
