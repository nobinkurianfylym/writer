import Link from "next/link";

/**
 * FYLYM Studio — the companion apps that carry a finished screenplay into
 * production. Writer cross-promotes them contextually (header nav, workspace
 * pages, and the post-export "next step" flow) as quiet, native-feeling
 * waypoints in the filmmaking journey — never as popups or banners.
 */
export interface StudioApp {
  id: "scheduler" | "pitch";
  name: string;
  url: string;
  tagline: string;
  features: string[];
  cta: string;
  /** How this app is framed as the writer's next step after finishing a script. */
  nextStep: string;
}

export const STUDIO_APPS: StudioApp[] = [
  {
    id: "scheduler",
    name: "Scheduler",
    url: "https://scheduler.fylym.com/?ref=writer",
    tagline: "Turn your screenplay into a production-ready schedule.",
    features: [
      "AI Script Breakdown",
      "Stripboard",
      "Shooting Schedule",
      "Budgeting",
      "Call Sheets",
      "Production Calendar",
    ],
    cta: "Open Scheduler",
    nextStep: "Generate a production schedule",
  },
  {
    id: "pitch",
    name: "Pitch",
    url: "https://pitch.fylym.com/?ref=writer",
    tagline: "Find verified producers, investors, grants, and funding opportunities.",
    features: [
      "Producer Finder",
      "Funding Discovery",
      "Film Funds",
      "Investors",
      "Grants",
      "Co-productions",
      "Tax Incentives",
      "Funding Readiness Score",
    ],
    cta: "Open Pitch",
    nextStep: "Find producers & funding",
  },
];

function ExternalArrow() {
  return (
    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
      →
    </span>
  );
}

/** One quiet card for a Studio app: name, tagline, feature line, text CTA. */
export function StudioCard({ app }: { app: StudioApp }) {
  return (
    <Link
      href={app.url}
      target="_blank"
      rel="noopener"
      className="group flex flex-col rounded-xl border bg-card p-5 transition hover:border-foreground/30 hover:shadow-sm"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        FYLYM {app.name}
      </p>
      <p className="mt-2 text-[15px] font-medium leading-snug">{app.tagline}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {app.features.join(" · ")}
      </p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
        {app.cta} <ExternalArrow />
      </span>
    </Link>
  );
}

/**
 * The "FYLYM Studio" strip shown at the foot of the workspace and project
 * pages — a heading and the two app cards, styled to read as part of the
 * product rather than promotion.
 */
export function StudioSection() {
  return (
    <section aria-label="FYLYM Studio" className="mt-16 border-t pt-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        FYLYM Studio
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">
        From script to screen
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {STUDIO_APPS.map((app) => (
          <StudioCard key={app.id} app={app} />
        ))}
      </div>
    </section>
  );
}

/**
 * The post-export "what's next" flow: the finished screenplay's natural next
 * steps, in order — schedule the shoot, then raise the money.
 */
export function StudioNextSteps() {
  return (
    <div className="mt-2 space-y-2" aria-label="Next steps">
      {STUDIO_APPS.map((app, i) => (
        <Link
          key={app.id}
          href={app.url}
          target="_blank"
          rel="noopener"
          className="group flex items-center justify-between rounded-lg border p-3 transition hover:border-foreground/30"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{app.nextStep}</span>
              <span className="block text-xs text-muted-foreground">
                FYLYM {app.name} — {app.tagline}
              </span>
            </span>
          </span>
          <span className="ml-3 shrink-0 text-sm font-medium">
            <ExternalArrow />
          </span>
        </Link>
      ))}
    </div>
  );
}
