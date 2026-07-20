"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarRange,
  Users,
  FolderLock,
  MessageSquareQuote,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { AiPanel } from "@/components/layout/ai-panel";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaign", label: "Campaign", icon: CalendarRange },
  { href: "/team", label: "Street Team", icon: Users },
  { href: "/assets", label: "Assets", icon: FolderLock },
  { href: "/reviews", label: "Review Wall", icon: MessageSquareQuote },
];

/**
 * The signed-in app frame: left navigation, main column, and the persistent
 * AI panel on the right. Pages render inside the main column only.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const hydrated = useSession((s) => s.hydrated);
  const signOut = useSession((s) => s.signOut);

  // Mock auth guard — wait for the persisted session to rehydrate before
  // deciding, or a hard refresh while signed in would bounce to /signin.
  useEffect(() => {
    if (hydrated && user === null) router.replace("/signin");
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border px-3 py-5 md:flex">
        <Link
          href="/dashboard"
          className="px-3 text-sm font-semibold tracking-[0.14em]"
        >
          PR.FYLYM
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                pathname.startsWith(href)
                  ? "bg-raised text-foreground"
                  : "text-muted hover:bg-raised/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {label}
            </Link>
          ))}
          <Link
            href="/films/new"
            className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Clapperboard className="h-4 w-4" strokeWidth={1.5} />
            New film
          </Link>
        </nav>
        <div className="border-t border-border px-3 pt-4">
          <p className="truncate text-[13px] font-medium">{user?.name}</p>
          <button
            onClick={() => {
              signOut();
              router.replace("/");
            }}
            className="mt-0.5 text-xs text-faint hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>

      <AiPanel />
    </div>
  );
}
