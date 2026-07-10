"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  toast,
} from "@fylym/ui";
import {
  useSnapshots,
  useCreateSnapshot,
  useRestoreSnapshot,
} from "@/lib/editor-hooks";

export function SnapshotMenu({
  scriptId,
  onRestored,
}: {
  scriptId: string;
  onRestored: () => void;
}) {
  const { data: snapshots } = useSnapshots(scriptId);
  const createSnapshot = useCreateSnapshot(scriptId);
  const restoreSnapshot = useRestoreSnapshot(scriptId);

  async function onCreate() {
    try {
      await createSnapshot.mutateAsync(undefined);
      toast.success("Snapshot saved");
    } catch {
      toast.error("Could not save snapshot");
    }
  }

  async function onRestore(id: string) {
    try {
      await restoreSnapshot.mutateAsync(id);
      toast.success("Restored from snapshot");
      onRestored();
    } catch {
      toast.error("Could not restore snapshot");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Snapshots
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onSelect={() => void onCreate()}
          disabled={createSnapshot.isPending}
        >
          Save a snapshot
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>History</DropdownMenuLabel>
        {snapshots && snapshots.length > 0 ? (
          snapshots.map((snap) => (
            <DropdownMenuItem
              key={snap.id}
              onSelect={(e) => {
                e.preventDefault();
                void onRestore(snap.id);
              }}
            >
              <span className="truncate">
                {snap.label ?? new Date(snap.createdAt).toLocaleString()}
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No snapshots yet
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
