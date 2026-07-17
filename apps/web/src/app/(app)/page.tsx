"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, toast } from "@fylym/ui";
import {
  useOrgs,
  useProjects,
  useCreateProject,
  useRenameProject,
  useTrashProject,
} from "@/lib/hooks";
import { InlineRename } from "@/components/inline-rename";
import { StudioSection } from "@/components/studio/studio";
import { ApiError } from "@/lib/api-client";

export default function DashboardPage() {
  const { data: orgs, isLoading: orgsLoading } = useOrgs();
  const org = orgs?.[0];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {org ? org.name : "Your projects"}
        </h1>
        <Link
          href="/trash"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Trash
        </Link>
      </div>

      {orgsLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : org ? (
        <ProjectsSection orgId={org.id} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No workspace found for your account.
        </p>
      )}
    </div>
  );
}

function ProjectsSection({ orgId }: { orgId: string }) {
  const { data: projects, isLoading } = useProjects(orgId);
  const createProject = useCreateProject(orgId);
  const renameProject = useRenameProject(orgId);
  const trashProject = useTrashProject(orgId);

  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    try {
      await createProject.mutateAsync({ title: name, genre: [], format: "FEATURE" });
      setTitle("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create project");
    }
  }

  return (
    <div>
      <form onSubmit={onCreate} className="mb-6 flex gap-2" aria-label="Create project">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New project title"
          aria-label="New project title"
        />
        <Button type="submit" disabled={createProject.isPending}>
          {createProject.isPending ? "Creating…" : "Create"}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projects && projects.length > 0 ? (
        <ul role="list" className="divide-y rounded-lg border">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <InlineRename
                  label={project.title}
                  value={project.title}
                  editing={editingId === project.id}
                  onStart={() => setEditingId(project.id)}
                  onCommit={(next) => {
                    setEditingId(null);
                    renameProject.mutate({ id: project.id, title: next });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${project.id}`}>Open</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => trashProject.mutate(project.id)}
                  aria-label={`Move ${project.title} to trash`}
                >
                  Trash
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">No projects yet</p>
          <p className="mt-1 text-sm">
            Start from a blank feature above or import — Phase 2 — coming.
          </p>
        </div>
      )}

      <StudioSection />
    </div>
  );
}
