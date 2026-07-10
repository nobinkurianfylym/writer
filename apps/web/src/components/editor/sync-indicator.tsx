"use client";

import type { SyncStatus } from "@/lib/use-script-doc";

const LABELS: Record<SyncStatus, string> = {
  loading: "Loading…",
  saving: "Saving…",
  synced: "Saved",
  offline: "Offline — saved locally",
  error: "Sync error",
};

const DOT: Record<SyncStatus, string> = {
  loading: "bg-muted-foreground",
  saving: "bg-amber-500",
  synced: "bg-emerald-500",
  offline: "bg-amber-500",
  error: "bg-red-500",
};

export function SyncIndicator({ status }: { status: SyncStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
      data-sync-status={status}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} aria-hidden />
      {LABELS[status]}
    </span>
  );
}
