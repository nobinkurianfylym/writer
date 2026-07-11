import type { Beat, BeatColor } from "@fylym/contracts";

export type { Beat, BeatColor };

export const COLOR_ORDER: BeatColor[] = [
  "gold",
  "blue",
  "rose",
  "green",
  "violet",
  "slate",
];

/** Swatch / border / card-tint per color, in oklch so they read on both themes. */
export const BEAT_COLORS: Record<
  BeatColor,
  { swatch: string; ring: string; tint: string }
> = {
  gold: { swatch: "oklch(0.78 0.11 80)", ring: "oklch(0.72 0.1 80)", tint: "oklch(0.97 0.03 85 / 0.5)" },
  blue: { swatch: "oklch(0.7 0.09 245)", ring: "oklch(0.62 0.1 245)", tint: "oklch(0.96 0.03 245 / 0.5)" },
  rose: { swatch: "oklch(0.72 0.11 20)", ring: "oklch(0.64 0.12 20)", tint: "oklch(0.96 0.03 20 / 0.5)" },
  green: { swatch: "oklch(0.72 0.09 155)", ring: "oklch(0.62 0.1 155)", tint: "oklch(0.96 0.03 155 / 0.5)" },
  violet: { swatch: "oklch(0.7 0.11 300)", ring: "oklch(0.62 0.12 300)", tint: "oklch(0.96 0.03 300 / 0.5)" },
  slate: { swatch: "oklch(0.7 0.02 260)", ring: "oklch(0.55 0.02 260)", tint: "oklch(0.96 0.005 260 / 0.5)" },
};

export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

export function newBeat(act = "Act I", color: BeatColor = "slate"): Beat {
  return { id: uid(), act, title: "New beat", summary: "", color };
}

interface TemplateBeat {
  act: string;
  title: string;
  summary: string;
  color: BeatColor;
}

export interface StructureTemplate {
  id: string;
  label: string;
  description: string;
  beats: TemplateBeat[];
}

const b = (
  act: string,
  title: string,
  summary: string,
  color: BeatColor,
): TemplateBeat => ({ act, title, summary, color });

/** A curated set of story structures the board can fill itself with. */
export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: "three-act",
    label: "Three-Act Structure",
    description: "The classic setup, confrontation, and resolution.",
    beats: [
      b("Act I", "Setup", "Establish the world, the hero, and the status quo.", "gold"),
      b("Act I", "Inciting incident", "The event that upends the ordinary world.", "gold"),
      b("Act I", "Plot point 1", "The hero commits to the journey.", "gold"),
      b("Act II", "Rising action", "Obstacles escalate; the hero adapts.", "blue"),
      b("Act II", "Midpoint", "A turn that raises the stakes.", "blue"),
      b("Act II", "Plot point 2", "All seems lost — the low point.", "violet"),
      b("Act III", "Climax", "The final confrontation.", "rose"),
      b("Act III", "Resolution", "The new normal; loose ends tie off.", "rose"),
    ],
  },
  {
    id: "save-the-cat",
    label: "Save the Cat — 15 Beats",
    description: "Blake Snyder's commercially proven beat blueprint.",
    beats: [
      b("Act I", "Opening image", "A snapshot of the world before change.", "gold"),
      b("Act I", "Theme stated", "Someone speaks the story's thesis.", "gold"),
      b("Act I", "Set-up", "Introduce hero, wants, flaws, and status quo.", "gold"),
      b("Act I", "Catalyst", "The life-changing event.", "gold"),
      b("Act I", "Debate", "Should I go? What if I fail?", "gold"),
      b("Act II", "Break into Two", "Hero commits to the new world.", "blue"),
      b("Act II", "B Story", "A relationship carries the theme.", "blue"),
      b("Act II", "Fun and Games", "The promise of the premise plays out.", "blue"),
      b("Act II", "Midpoint", "False victory or false defeat — stakes raised.", "blue"),
      b("Act II", "Bad Guys Close In", "External and internal pressure mount.", "violet"),
      b("Act II", "All Is Lost", "The whiff of death — everything collapses.", "violet"),
      b("Act II", "Dark Night of the Soul", "The lowest emotional point.", "violet"),
      b("Act III", "Break into Three", "A new idea born from theme + B-story.", "rose"),
      b("Act III", "Finale", "Storm the castle; dispatch the antagonist.", "rose"),
      b("Act III", "Final image", "Mirror of the opening — proof of change.", "rose"),
    ],
  },
  {
    id: "heros-journey",
    label: "The Hero's Journey",
    description: "Campbell's 12-stage monomyth.",
    beats: [
      b("Act I", "Ordinary world", "The hero's normal life before the story.", "gold"),
      b("Act I", "Call to adventure", "A challenge or quest is presented.", "gold"),
      b("Act I", "Refusal of the call", "Fear and hesitation hold the hero back.", "gold"),
      b("Act I", "Meeting the mentor", "Guidance and tools for the road ahead.", "gold"),
      b("Act II", "Crossing the threshold", "The hero commits and enters a new world.", "blue"),
      b("Act II", "Tests, allies, enemies", "Learning the rules of the new world.", "blue"),
      b("Act II", "Approach the inmost cave", "Preparing for the central ordeal.", "blue"),
      b("Act II", "The ordeal", "The greatest fear; a brush with death.", "violet"),
      b("Act II", "Reward", "The hero seizes the prize.", "violet"),
      b("Act III", "The road back", "Driven to complete the journey home.", "rose"),
      b("Act III", "Resurrection", "The final test; the hero is transformed.", "rose"),
      b("Act III", "Return with the elixir", "Home again, changed, with something to share.", "rose"),
    ],
  },
  {
    id: "story-circle",
    label: "Dan Harmon's Story Circle",
    description: "An eight-step loop of comfort, need, and change.",
    beats: [
      b("Act I", "You", "A character in a zone of comfort.", "gold"),
      b("Act I", "Need", "But they want something.", "gold"),
      b("Act II", "Go", "They enter an unfamiliar situation.", "blue"),
      b("Act II", "Search", "Adapt to it, facing trials.", "blue"),
      b("Act II", "Find", "Getting what they wanted.", "violet"),
      b("Act III", "Take", "Paying a heavy price for it.", "rose"),
      b("Act III", "Return", "Back to their familiar situation.", "rose"),
      b("Act III", "Change", "Having changed fundamentally.", "rose"),
    ],
  },
];

/** Instantiate a template into fresh beats with new ids. */
export function beatsFromTemplate(tpl: StructureTemplate): Beat[] {
  return tpl.beats.map((tb) => ({ id: uid(), ...tb }));
}
