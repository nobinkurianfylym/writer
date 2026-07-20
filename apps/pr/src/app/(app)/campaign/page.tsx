import { CampaignTimeline } from "@/features/campaign/campaign-timeline";
import { getFilm, getTimeline } from "@/lib/mock";

export default function CampaignPage() {
  const film = getFilm();
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
        Campaign
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {film.title} — from announcement to awards
      </h1>
      <p className="mt-1 text-sm text-muted">
        Every phase of the publicity arc. Click a phase to see where it stands.
      </p>
      <div className="mt-10">
        <CampaignTimeline entries={getTimeline()} />
      </div>
    </div>
  );
}
