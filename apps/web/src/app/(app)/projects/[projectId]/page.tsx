"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Button, Input, toast } from "@fylym/ui";
import {
  useScripts,
  useCreateScript,
  useRenameScript,
  useTrashScript,
} from "@/lib/hooks";
import { InlineRename } from "@/components/inline-rename";
import { StudioSection } from "@/components/studio/studio";
import { ApiError } from "@/lib/api-client";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { data: scripts, isLoading } = useScripts(projectId);
  const createScript = useCreateScript(projectId);
  const renameScript = useRenameScript(projectId);
  const trashScript = useTrashScript(projectId);

  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    try {
      await createScript.mutateAsync({ title: name, formatProfile: "us-feature" });
      setTitle("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create script");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline hover:text-foreground"
      >
        ← All projects
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">Scripts</h1>

      <form onSubmit={onCreate} className="mb-6 flex gap-2" aria-label="Create script">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New script title"
          aria-label="New script title"
        />
        <Button type="submit" disabled={createScript.isPending}>
          {createScript.isPending ? "Creating…" : "Create"}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading scripts…</p>
      ) : scripts && scripts.length > 0 ? (
        <ul role="list" className="divide-y rounded-lg border">
          {scripts.map((script) => (
            <li
              key={script.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <InlineRename
                  label={script.title}
                  value={script.title}
                  editing={editingId === script.id}
                  onStart={() => setEditingId(script.id)}
                  onCommit={(next) => {
                    setEditingId(null);
                    renameScript.mutate({ id: script.id, title: next });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/editor/${script.id}`}>Open in editor</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => trashScript.mutate(script.id)}
                  aria-label={`Move ${script.title} to trash`}
                >
                  Trash
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">No scripts yet</p>
          <p className="mt-1 text-sm">
            Create your first draft above to start writing.
          </p>
        </div>
      )}

      <StudioSection />
    </div>
  );
}
