import Link from "next/link";
import { Button } from "@fylym/ui";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold">FYLYM Writer</h1>
      <p className="text-muted-foreground">Foundation scaffold — Phase 1, Epic E0.</p>
      <Button asChild>
        <Link href="/design">View design system</Link>
      </Button>
    </main>
  );
}
