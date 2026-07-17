"use client";

import Link from "next/link";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@fylym/ui";
import { useSession } from "@/lib/session";
import { STUDIO_APPS } from "@/components/studio/studio";

export function AppHeader() {
  const { user, logout } = useSession();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          FYLYM Writer
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              Studio
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              FYLYM Studio
            </DropdownMenuLabel>
            {STUDIO_APPS.map((app) => (
              <DropdownMenuItem key={app.id} asChild>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener"
                  className="flex w-full flex-col items-start gap-0.5 text-left"
                >
                  <span className="text-sm font-medium">{app.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {app.tagline}
                  </span>
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Account menu">
              {user?.name ?? "Account"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="max-w-[16rem] truncate">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
