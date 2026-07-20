"use client";

import { useState } from "react";
import { UserPlus, Check } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTeam } from "@/lib/mock";
import type { TeamMember } from "@/types";

const STATUS_TONE: Record<TeamMember["status"], BadgeTone> = {
  Active: "positive",
  Invited: "attention",
  Paused: "neutral",
};

export default function TeamPage() {
  const [copied, setCopied] = useState(false);
  const team = getTeam();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
            Street Team
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            The people carrying your film
          </h1>
        </div>
        <Button
          onClick={() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Invite link copied
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" strokeWidth={1.5} /> Invite
            </>
          )}
        </Button>
      </div>

      <Card className="mt-8 p-0">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-6 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          <span>Member</span>
          <span>Status</span>
          <span className="text-right">Contribution</span>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {team.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-6 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="text-[13px] text-faint">{m.role}</p>
              </div>
              <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
              <p className="text-right text-sm tabular-nums text-muted">
                {m.contribution > 0 ? `${m.contribution} pts` : "—"}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
