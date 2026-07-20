import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-border text-muted",
  positive: "border-emerald-900 text-emerald-400",
  attention: "border-amber-900 text-amber-400",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
