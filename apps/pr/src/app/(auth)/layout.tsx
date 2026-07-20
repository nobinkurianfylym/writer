import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link
        href="/"
        className="mb-10 text-sm font-semibold tracking-[0.14em] text-muted hover:text-foreground"
      >
        PR.FYLYM
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
