import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { HealthScore } from "@/features/dashboard/health-score";
import { MissionCard } from "@/features/dashboard/mission-card";
import { CampaignTimeline } from "@/features/campaign/campaign-timeline";
import { ReviewCard } from "@/features/reviews/review-card";
import {
  getActivity,
  getFilm,
  getMissions,
  getReviews,
  getTimeline,
  formatDate,
} from "@/lib/mock";

export default function DashboardPage() {
  const film = getFilm();
  const missions = getMissions();
  const timeline = getTimeline();
  const upcoming = timeline.filter((t) => t.status === "upcoming").slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <HealthScore film={film} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Today&apos;s priorities</CardTitle>
            <span className="text-xs text-faint">
              {missions.filter((m) => !m.done).length} open
            </span>
          </div>
          <div className="mt-2 divide-y divide-border">
            {missions.map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Campaign timeline</CardTitle>
            <Link href="/campaign" className="text-xs text-faint hover:text-foreground">
              Open →
            </Link>
          </div>
          <div className="mt-4">
            <CampaignTimeline entries={timeline} compact />
          </div>
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <ul className="mt-3 space-y-3">
            {getActivity().map((a) => (
              <li key={a.id} className="flex gap-3 text-[13px] leading-relaxed">
                <span className="w-16 shrink-0 text-faint">{a.when}</span>
                <span className="text-muted">{a.text}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-baseline justify-between">
              <CardTitle>Latest reviews</CardTitle>
              <Link href="/reviews" className="text-xs text-faint hover:text-foreground">
                Review Wall →
              </Link>
            </div>
            <div className="mt-3 space-y-3">
              {getReviews()
                .slice(0, 2)
                .map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Upcoming milestones</CardTitle>
            <ul className="mt-3 space-y-2.5">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between text-sm">
                  <span>{t.phase}</span>
                  <span className="text-xs text-faint">{formatDate(t.date)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
