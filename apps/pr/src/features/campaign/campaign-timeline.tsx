"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/mock";
import type { TimelineEntry } from "@/types";

/**
 * The campaign spine: one clickable card per phase. `compact` renders the
 * dashboard preview (no expansion); the full page lets a card open to show
 * its summary.
 */
export function CampaignTimeline({
  entries,
  compact = false,
}: {
  entries: TimelineEntry[];
  compact?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(
    entries.find((e) => e.status === "active")?.id ?? null,
  );

  return (
    <ol className="relative ml-2 border-l border-border">
      {entries.map((entry) => {
        const open = !compact && openId === entry.id;
        return (
          <li key={entry.id} className="relative pb-6 pl-6 last:pb-0">
            <span
              className={cn(
                "absolute -left-[9px] top-1 flex h-[17px] w-[17px] items-center justify-center rounded-full border bg-background",
                entry.status === "done" && "border-foreground bg-foreground",
                entry.status === "active" && "border-foreground",
                entry.status === "upcoming" && "border-border",
              )}
            >
              {entry.status === "done" && (
                <Check className="h-3 w-3 text-background" strokeWidth={3} />
              )}
              {entry.status === "active" && (
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </span>

            <button
              onClick={() => !compact && setOpenId(open ? null : entry.id)}
              className={cn(
                "w-full rounded-lg text-left",
                !compact &&
                  "-mx-2 px-2 py-1 transition-colors hover:bg-raised/60",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-sm font-medium",
                    entry.status === "upcoming" && "text-muted",
                  )}
                >
                  {entry.phase}
                </span>
                <span className="shrink-0 text-xs text-faint">
                  {formatDate(entry.date)}
                </span>
              </div>
              {entry.status === "active" && (
                <Badge tone="positive" className="mt-1">
                  In progress
                </Badge>
              )}
              {open && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {entry.summary}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
