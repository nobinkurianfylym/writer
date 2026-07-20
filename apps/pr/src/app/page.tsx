import Link from "next/link";
import {
  Brain,
  Users,
  Radar,
  FolderLock,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES: { icon: LucideIcon; name: string; blurb: string }[] = [
  {
    icon: Brain,
    name: "AI Campaign Brain",
    blurb: "A living plan for every phase, from announcement to awards.",
  },
  {
    icon: Users,
    name: "Street Team",
    blurb: "Organise fans, campuses, and theatres into one publicity engine.",
  },
  {
    icon: Radar,
    name: "Review Radar",
    blurb: "Every review, tracked and turned into shareable quote cards.",
  },
  {
    icon: FolderLock,
    name: "Asset Vault",
    blurb: "Posters, trailers, and EPKs — always the right version.",
  },
  {
    icon: LineChart,
    name: "PR Intelligence",
    blurb: "Know what moved the needle, while there is still time to act.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between px-6 md:px-10">
        <span className="text-sm font-semibold tracking-[0.14em]">
          PR.FYLYM
        </span>
        <Link href="/signin" className="text-sm text-muted hover:text-foreground">
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-[13px] font-medium uppercase tracking-[0.3em] text-faint">
          PR.FYLYM
        </p>
        <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          The AI Publicity Operating System for Films.
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-muted">
          Plan, run, and measure your film&apos;s entire publicity campaign —
          one calm surface from announcement to awards.
        </p>
        <Link href="/signup" className="mt-10">
          <Button size="lg">Start Campaign</Button>
        </Link>

        <div className="mt-28 grid w-full max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map(({ icon: Icon, name, blurb }) => (
            <div key={name} className="bg-surface p-6 text-left">
              <Icon className="h-5 w-5 text-muted" strokeWidth={1.5} />
              <p className="mt-4 text-sm font-medium">{name}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-faint">
                {blurb}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-6 py-8 text-center text-xs text-faint">
        FYLYM Studio — Writer · Scheduler · Pitch · PR
      </footer>
    </div>
  );
}
