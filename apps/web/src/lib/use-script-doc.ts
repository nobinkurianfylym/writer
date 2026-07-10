"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decompress } from "fzstd";
import type { ScreenplayDocument } from "@fylym/screenplay-core";
import type { ScriptState } from "@fylym/contracts";
import { useSession } from "./session";
import { ApiError } from "./api-client";
import { idbGetState, idbPutState, idbClearState } from "./idb-kv";
import {
  buildYState,
  hydrateDocument,
  bytesToBase64,
  base64ToBytes,
} from "./ydoc";

export type SyncStatus =
  | "loading"
  | "synced"
  | "saving"
  | "offline"
  | "error";

const EMPTY_DOCUMENT: ScreenplayDocument = {
  blocks: [{ id: "seed", type: "action", text: "", marks: [], attrs: {} }],
};

const SAVE_DEBOUNCE_MS = 800;

/**
 * Loads a script's document IndexedDB-first, falling back to the server's
 * stored state (§5, §9 durability). Autosaves edits to IndexedDB immediately
 * and to the server on a debounce, surfacing a sync status. Returns null
 * `initialDocument` until the first load resolves.
 */
export function useScriptDoc(scriptId: string) {
  const { apiRequest } = useSession();
  const [initialDocument, setInitialDocument] =
    useState<ScreenplayDocument | null>(null);
  const [status, setStatus] = useState<SyncStatus>("loading");
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ScreenplayDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setInitialDocument(null);

    (async () => {
      // 1. IndexedDB first — the offline-durable local copy.
      const local = await idbGetState(scriptId);
      if (!cancelled && local) {
        setInitialDocument(hydrateDocument(local));
        setStatus("synced");
        return;
      }

      // 2. Server fallback.
      try {
        const state = await apiRequest<ScriptState>(
          `/v1/scripts/${scriptId}/state`,
        );
        const stored = base64ToBytes(state.ydocState);
        const raw =
          state.compression === "zstd" ? decompress(stored) : stored;
        await idbPutState(scriptId, raw);
        if (!cancelled) {
          setInitialDocument(hydrateDocument(raw));
          setStatus("synced");
        }
      } catch (err) {
        // 404 = script has no stored state yet → start from a blank page.
        if (err instanceof ApiError && err.status === 404) {
          if (!cancelled) {
            setInitialDocument(EMPTY_DOCUMENT);
            setStatus("synced");
          }
        } else if (!cancelled) {
          setInitialDocument(EMPTY_DOCUMENT);
          setStatus("offline");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scriptId, apiRequest, nonce]);

  /** Drop the local copy and reload from the server (after a snapshot restore). */
  const reload = useCallback(async () => {
    await idbClearState(scriptId);
    setNonce((n) => n + 1);
  }, [scriptId]);

  const persist = useCallback(
    async (doc: ScreenplayDocument) => {
      const bytes = buildYState(doc.blocks);
      await idbPutState(scriptId, bytes); // local, always
      try {
        await apiRequest<{ scriptId: string; bytes: number }>(
          `/v1/scripts/${scriptId}/state`,
          {
            method: "PUT",
            body: { ydocState: bytesToBase64(bytes), compression: "none" },
          },
        );
        setStatus("synced");
      } catch {
        setStatus("offline"); // saved locally; will sync when back online
      }
    },
    [scriptId, apiRequest],
  );

  const onChange = useCallback(
    (doc: ScreenplayDocument) => {
      latest.current = doc;
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (latest.current) void persist(latest.current);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current) void persist(latest.current);
      }
    };
  }, [persist]);

  return { initialDocument, status, onChange, reload };
}
