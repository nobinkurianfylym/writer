import { Sparkles, ArrowRight } from "lucide-react";
import { getFilm, getRecommendations, daysUntil } from "@/lib/mock";

/**
 * The persistent AI sidebar. Static mock responses for now; Phase 2's
 * Campaign Brain replaces getRecommendations() with a live model call and
 * this panel does not change shape.
 */
export function AiPanel() {
  const rec = getRecommendations();
  const film = getFilm();

  return (
    <aside className="hidden w-80 shrink-0 border-l border-border px-6 py-8 xl:block">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
        Campaign Brain
      </div>

      <section className="mt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          Today&apos;s recommendation
        </p>
        <p className="mt-2 text-sm leading-relaxed">{rec.today}</p>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          Next action
        </p>
        <p className="mt-2 text-sm leading-relaxed">{rec.nextAction}</p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium">
          Do it now <ArrowRight className="h-3.5 w-3.5" />
        </p>
      </section>

      <section className="mt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
          Campaign summary
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{rec.summary}</p>
        <p className="mt-4 text-xs text-faint">
          {film.title} · {daysUntil(film.releaseDate)} days to release
        </p>
      </section>
    </aside>
  );
}
