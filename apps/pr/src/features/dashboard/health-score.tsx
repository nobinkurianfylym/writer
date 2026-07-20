import { Card } from "@/components/ui/card";
import { daysUntil, formatDate } from "@/lib/mock";
import type { Film } from "@/types";

/** The dashboard hero: one number a producer can act on. */
export function HealthScore({ film }: { film: Film }) {
  const days = daysUntil(film.releaseDate);
  const circumference = 2 * Math.PI * 44;

  return (
    <Card className="flex items-center gap-8 p-8">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            strokeWidth="6"
            className="stroke-raised"
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className="stroke-foreground"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - film.healthScore / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold">
          {film.healthScore}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          Publicity Health Score™
        </p>
        <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight">
          {film.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {film.phase} phase · releases {formatDate(film.releaseDate)} ·{" "}
          <span className="text-foreground">{days} days out</span>
        </p>
      </div>
    </Card>
  );
}
