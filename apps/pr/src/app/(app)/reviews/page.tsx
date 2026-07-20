import { ReviewCard } from "@/features/reviews/review-card";
import { getReviews } from "@/lib/mock";

export default function ReviewsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
        Review Wall
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        What the press is saying
      </h1>
      <p className="mt-1 text-sm text-muted">
        Turn any review into a shareable quote card in one click.
      </p>

      <div className="mt-8 columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
        {getReviews().map((r) => (
          <ReviewCard key={r.id} review={r} withQuoteCard />
        ))}
      </div>
    </div>
  );
}
