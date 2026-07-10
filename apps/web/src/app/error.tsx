"use client";

import { useEffect } from "react";
import { Button } from "@fylym/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the console for now; Sentry wiring lands in E6-5.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. You can try again — if it keeps happening,
        please reach out to support.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
