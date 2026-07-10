"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@fylym/ui";
import { useSession } from "@/lib/session";

interface Command {
  id: string;
  label: string;
  keywords?: string;
  run: () => void;
}

/**
 * The app-wide ⌘K command palette. Phase 1 ships navigation + session
 * commands; dashboards and editor actions register more as they land.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { logout } = useSession();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands: Command[] = [
    {
      id: "home",
      label: "Go to dashboard",
      keywords: "home projects",
      run: () => router.push("/"),
    },
    {
      id: "logout",
      label: "Log out",
      keywords: "sign out exit",
      run: () => void logout(),
    },
  ];

  function runCommand(command: Command) {
    setOpen(false);
    command.run();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {commands.map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.label} ${command.keywords ?? ""}`}
              onSelect={() => runCommand(command)}
            >
              {command.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
