import { Circle, CheckCircle2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Mission } from "@/types";

const IMPACT_TONE: Record<Mission["impact"], BadgeTone> = {
  High: "attention",
  Medium: "neutral",
  Low: "neutral",
};

export function MissionCard({ mission }: { mission: Mission }) {
  const Icon = mission.done ? CheckCircle2 : Circle;
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          mission.done ? "text-emerald-400" : "text-faint",
        )}
        strokeWidth={1.5}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            mission.done && "text-faint line-through",
          )}
        >
          {mission.title}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-faint">
          {mission.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={IMPACT_TONE[mission.impact]}>{mission.impact}</Badge>
        <span className="text-xs text-faint">{mission.due}</span>
      </div>
    </div>
  );
}
