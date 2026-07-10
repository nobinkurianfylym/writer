"use client";

import Link from "next/link";
import { Button } from "@fylym/ui";
import { useOrgs, useProjects, useRestoreProject } from "@/lib/hooks";

export default function TrashPage() {
  const { data: orgs } = useOrgs();
  const org = orgs?.[0];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline hover:text-foreground"
      >
        ← Back to projects
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold tracking-tight">Trash</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Trashed projects are restorable for 30 days.
      </p>

      {org ? <TrashList orgId={org.id} /> : null}
    </div>
  );
}

function TrashList({ orgId }: { orgId: string }) {
  const { data: projects, isLoading } = useProjects(orgId, true);
  const restore = useRestoreProject(orgId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Trash is empty</p>
      </div>
    );
  }

  return (
    <ul role="list" className="divide-y rounded-lg border">
      {projects.map((project) => (
        <li
          key={project.id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {project.title}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => restore.mutate(project.id)}
            aria-label={`Restore ${project.title}`}
          >
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}
