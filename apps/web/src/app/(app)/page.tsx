"use client";

import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const { user } = useSession();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome{user?.name ? `, ${user.name}` : ""}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Your projects and scripts will live here.
      </p>

      {user && !user.emailVerified && (
        <div
          role="status"
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Please verify your email — check your inbox for the verification link.
        </div>
      )}

      <div className="mt-8 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No projects yet</p>
        <p className="mt-1 text-sm">
          Start from a blank feature or import — Phase 2 — coming.
        </p>
        <p className="mt-4 text-xs">
          Press <kbd className="rounded border bg-muted px-1">⌘K</kbd> for commands.
        </p>
      </div>
    </div>
  );
}
