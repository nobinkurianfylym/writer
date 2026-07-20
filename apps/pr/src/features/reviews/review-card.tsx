"use client";

import { useState } from "react";
import { Star, StarHalf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/mock";
import type { Review } from "@/types";

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5 text-foreground">
      {Array.from({ length: full }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
      ))}
      {half && <StarHalf className="h-3.5 w-3.5 fill-current" strokeWidth={0} />}
    </span>
  );
}

/**
 * One review on the wall. "Generate Quote Card" flips the card into the
 * shareable artwork Phase 2's generator will export as an image.
 */
export function ReviewCard({
  review,
  withQuoteCard = false,
}: {
  review: Review;
  withQuoteCard?: boolean;
}) {
  const [showCard, setShowCard] = useState(false);

  if (showCard) {
    return (
      <figure className="break-inside-avoid rounded-xl border border-foreground/20 bg-foreground p-6 text-background">
        <Stars rating={review.rating} />
        <blockquote className="mt-3 text-lg font-medium leading-snug">
          “{review.quote}”
        </blockquote>
        <figcaption className="mt-4 text-[13px] opacity-70">
          {review.publication} — THIRA · In cinemas Nov 20
        </figcaption>
        <button
          onClick={() => setShowCard(false)}
          className="mt-4 text-xs underline opacity-60 hover:opacity-100"
        >
          Back to review
        </button>
      </figure>
    );
  }

  return (
    <figure className="break-inside-avoid rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <Stars rating={review.rating} />
        <span className="text-xs text-faint">{formatDate(review.date)}</span>
      </div>
      <blockquote className="mt-3 text-sm leading-relaxed">
        “{review.quote}”
      </blockquote>
      <figcaption className="mt-3 text-[13px] text-muted">
        {review.publication} · {review.critic}
      </figcaption>
      {withQuoteCard && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setShowCard(true)}
        >
          Generate Quote Card
        </Button>
      )}
    </figure>
  );
}
