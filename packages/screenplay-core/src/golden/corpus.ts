import { BLOCK_TYPES, type ScreenplayDocument } from "../model.js";
import type { FormatProfile } from "../format-profile.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { usTvOneHourProfile } from "../profiles/us-tv-onehour.js";
import { DocBuilder } from "./builders.js";

export interface CorpusEntry {
  name: string;
  description: string;
  profile: FormatProfile;
  build(): ScreenplayDocument;
  /**
   * Set when this entry deliberately exercises a construct Fountain's
   * grammar can't losslessly represent — a real, permanent limitation of
   * the format, not a bug in this codebase. Omit for entries expected to
   * round-trip through Fountain exactly.
   */
  knownFountainLimitation?: {
    reason: string;
    /**
     * "insensitive": the harness compares after collapsing shot→action and
     * dropping revision marks (both real Fountain gaps — no shot syntax, no
     * revision-color syntax) — everything else must still match exactly.
     * "skip": the entry's structure isn't Fountain-representable at all
     * (e.g. dialogue/parenthetical with no preceding character cue), so
     * only "parsing doesn't throw" is asserted.
     */
    mode: "insensitive" | "skip";
  };
  /** Same idea as knownFountainLimitation, for a documented FDX-side asymmetry (see golden.test.ts's applyKnownFdxLimitation). */
  knownFdxLimitation?: {
    reason: string;
    mode: "insensitive";
  };
}

/**
 * NOTE ON PROVENANCE: the build plan calls for "public-domain screenplays
 * reformatted" alongside purpose-written stress fixtures. This corpus is
 * entirely purpose-written — no real screenplay text is reproduced here.
 * Fetching and reformatting actual public-domain scripts would mean pulling
 * external text into the repo without being able to verify its license
 * status firsthand; the safer substitution is original fixtures that
 * exercise the same structural patterns real scripts would. Flagged
 * explicitly per the same disclosure practice used for the Fountain/FDX
 * fixtures in E1-6/E1-7.
 */
const ENTRIES: CorpusEntry[] = [];

function register(entry: CorpusEntry): void {
  ENTRIES.push(entry);
}

// --- Ordinary scenes, one structural pattern each ---------------------------

register({
  name: "minimal-scene",
  description: "The smallest possible non-empty document: one scene heading, one action line.",
  profile: usFeatureProfile,
  build: () => new DocBuilder().sceneHeading("INT. ROOM - DAY").action("Nothing happens.").build(),
});

register({
  name: "basic-dialogue-exchange",
  description: "Scene heading, action, a single character/dialogue exchange.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. KITCHEN - MORNING")
      .action("Sarah pours coffee, watching the door.")
      .exchange("SARAH", "You're up early.")
      .build(),
});

register({
  name: "dialogue-with-parenthetical",
  description: "A character/parenthetical/dialogue triple.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. OFFICE - DAY")
      .action("Tom stares at the phone.")
      .exchange("TOM", "Fine. I'll do it.", "quietly")
      .build(),
});

register({
  name: "multi-character-conversation",
  description: "A back-and-forth conversation between three characters, no dual dialogue.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. DINER - NIGHT")
      .action("Three old friends around a booth.")
      .exchange("ANA", "So what did he say?")
      .exchange("BEN", "Nothing. That's the problem.")
      .exchange("CARLA", "He never says anything.")
      .exchange("ANA", "Exactly.")
      .build(),
});

register({
  name: "dual-dialogue-simple",
  description: "One dual-dialogue exchange between two characters talking over each other.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. CAR - MOVING - DAY")
      .action("They argue as the city blurs past.")
      .dualDialogue(
        (b) => b.exchange("DRIVER", "I said I was sorry!"),
        (b) => b.exchange("PASSENGER", "You always say that."),
      )
      .build(),
});

register({
  name: "dual-dialogue-heavy",
  description: "Required stress category: many consecutive dual-dialogue exchanges, some with parentheticals.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder().sceneHeading("INT. CROWDED PARTY - NIGHT").action("The room is a wall of overlapping voices.");
    for (let i = 1; i <= 8; i++) {
      b.dualDialogue(
        (left) => left.exchange(`GUEST ${i}A`, `That's the ${i}${i === 1 ? "st" : "th"} time I've heard that story.`, i % 2 === 0 ? "laughing" : undefined),
        (right) => right.exchange(`GUEST ${i}B`, `Well it's true every time.`),
      );
    }
    return b.action("The party rolls on.").build();
  },
});

register({
  name: "musical-lyrics",
  description: "Required stress category: a musical number — many lyric blocks interleaved with action and dialogue.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder()
      .sceneHeading("INT. STAGE - NIGHT")
      .action("The band strikes up. MARGO steps into the spotlight.")
      .character("MARGO");
    const verses = [
      "There's a light beyond the water,",
      "and a road I've never known,",
      "every step a little further",
      "from the life I used to own.",
      "So I'm singing to the harbor,",
      "to the ships I'll never see,",
      "and I'm hoping that the chorus",
      "finds its way back home to me.",
    ];
    for (const line of verses) b.lyric(line);
    b.action("She holds the final note.").exchange("MARGO", "Thank you. Goodnight.");
    return b.build();
  },
});

register({
  name: "five-page-single-scene",
  description: "Required stress category: one continuous scene long enough to span roughly 5 pages, forcing splittable-action page breaks.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder().sceneHeading("INT. ABANDONED LIBRARY - CONTINUOUS");
    const paragraph =
      "Dust hangs in the shafts of afternoon light. Row after row of shelves stretch back into the dark, spines cracked, pages swollen with damp. Somewhere above, a pipe ticks as it cools. She moves down the aisle slowly, fingertips trailing along the bindings, reading titles that don't exist anymore, publishers that folded decades ago, names nobody remembers.";
    for (let i = 0; i < 45; i++) {
      b.action(`${paragraph} (${i + 1})`);
    }
    return b.build();
  },
});

register({
  name: "two-hundred-scene-feature",
  description: "Required stress category: 200 short scenes in sequence, each with a scene number, brief action, and one exchange.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder();
    const locations = ["HOUSE", "STREET", "OFFICE", "CAR", "PARK", "CAFE", "STATION", "ROOFTOP"];
    for (let i = 1; i <= 200; i++) {
      const loc = locations[i % locations.length];
      const timeOfDay = i % 2 === 0 ? "DAY" : "NIGHT";
      b.sceneHeading(`INT. ${loc} - ${timeOfDay}`, String(i));
      b.action(`Scene ${i} unfolds quickly.`);
      b.exchange("ALEX", `This is beat number ${i}.`);
    }
    return b.build();
  },
});

register({
  name: "every-element-adjacency-pair",
  description:
    "Required stress category: every ordinary block type placed adjacent to every other, in sequence, so the pagination/layout/serialization path sees each transition at least once.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason:
      "Includes structurally atypical adjacencies (e.g. dialogue/parenthetical with no preceding character cue) that have no Fountain representation at all — this fixture's purpose is exercising every transition without crashing, not lossless round-tripping.",
    mode: "skip",
  },
  build: () => {
    const b = new DocBuilder();
    const ORDINARY = BLOCK_TYPES.filter((t) => t !== "dual_dialogue" && t !== "title_page");
    for (const from of ORDINARY) {
      for (const to of ORDINARY) {
        addByType(b, from, `${from.replace(/_/g, "")}-before-${to.replace(/_/g, "")}`);
        addByType(b, to, `${to.replace(/_/g, "")}-after-${from.replace(/_/g, "")}`);
      }
    }
    return b.build();
  },
});

function addByType(b: DocBuilder, type: (typeof BLOCK_TYPES)[number], text: string): void {
  switch (type) {
    case "scene_heading":
      b.sceneHeading(`INT. ${text.toUpperCase()} - DAY`);
      return;
    case "action":
      b.action(text);
      return;
    case "character":
      b.character(text.toUpperCase());
      return;
    case "dialogue":
      b.dialogue(text);
      return;
    case "parenthetical":
      b.parenthetical(text);
      return;
    case "transition":
      b.transition(`${text.toUpperCase()}:`);
      return;
    case "shot":
      b.shot(text.toUpperCase());
      return;
    case "lyric":
      b.lyric(text);
      return;
    case "centered":
      b.centered(text);
      return;
    case "note":
      b.note(text);
      return;
    case "section":
      b.section(text);
      return;
    case "synopsis":
      b.synopsis(text);
      return;
    case "page_break":
      b.pageBreak();
      return;
    case "dual_dialogue":
    case "title_page":
      return; // handled structurally elsewhere, not part of the adjacency sweep
  }
}

// --- Feature-focused fixtures -------------------------------------------------

register({
  name: "transitions-heavy",
  description: "Many transitions of different kinds between short scenes.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. HOUSE - DAY")
      .action("A door closes.")
      .transition("CUT TO:")
      .sceneHeading("EXT. STREET - DAY")
      .action("Rain begins.")
      .transition("DISSOLVE TO:")
      .sceneHeading("INT. CAR - NIGHT")
      .action("Headlights sweep the ceiling.")
      .transition("SMASH CUT TO:")
      .sceneHeading("EXT. CLIFF - DAWN")
      .action("The sun breaks over the water.")
      .build(),
});

register({
  name: "shots-and-action",
  description: "Shot elements interspersed with action, no dialogue.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason: "Fountain has no dedicated shot syntax (§8) — shot round-trips as forced action.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .sceneHeading("EXT. BATTLEFIELD - DAWN")
      .action("Smoke drifts across the field.")
      .shot("CLOSE ON A BOOT, half-buried in mud.")
      .action("It doesn't move.")
      .shot("WIDE - the full scale of it becomes clear.")
      .build(),
});

register({
  name: "centered-text-titles",
  description: "Centered text used for card-style titles, e.g. an ending card.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. THEATER - NIGHT")
      .action("The screen fades to black.")
      .centered("THE END")
      .build(),
});

register({
  name: "notes-and-boneyard",
  description: "Production note blocks interspersed with normal content.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. WAREHOUSE - NIGHT")
      .note("Confirm this location is still available for the reshoot.")
      .action("Boxes stacked to the ceiling.")
      .note("VFX: extend the warehouse in post.")
      .exchange("FOREMAN", "Careful with that one.")
      .build(),
});

register({
  name: "sections-and-synopses",
  description: "Outline-style section/synopsis blocks bracketing scene content.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .section("ACT ONE")
      .synopsis("Our hero discovers the letter and decides to leave home.")
      .sceneHeading("INT. FARMHOUSE - MORNING")
      .action("Dust motes turn in the light over the kitchen table.")
      .section("ACT TWO")
      .synopsis("The road tests everything she thought she knew.")
      .sceneHeading("EXT. HIGHWAY - DAY")
      .action("An endless line of asphalt.")
      .build(),
});

register({
  name: "title-page-present",
  description: "A full title page (title, credit, author, contact, date) ahead of the body.",
  profile: usFeatureProfile,
  knownFdxLimitation: {
    reason:
      "A title page's FDX paragraphs are always captured as passthrough on first parse (so a later round trip stays byte-exact), even when freshly synthesized — see fdx/parse.ts's parseTitlePage.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .titlePage("Title: THE LONG WAY HOME\nCredit: Written by\nAuthor: J. Author\nContact: writer@example.com\nDraft: First Draft")
      .sceneHeading("INT. STATION - DAY")
      .action("She checks the departures board one more time.")
      .build(),
});

register({
  name: "no-title-page",
  description: "Body-only document with no title page block at all, to check nothing assumes one exists.",
  profile: usFeatureProfile,
  build: () => new DocBuilder().sceneHeading("INT. GARAGE - DAY").action("An old car under a sheet.").build(),
});

register({
  name: "emphasis-heavy",
  description: "Bold, italic, underline, and strike marks throughout action and dialogue, including overlaps.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason: "Fountain has no standard strikethrough syntax (see emphasis.ts) — strike marks are dropped on round-trip.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. STUDY - NIGHT")
      .action("He reads the letter twice, then a third time.", [
        { kind: "italic", start: 0, end: 2 },
        { kind: "bold", start: 3, end: 8 },
      ])
      .exchange("HE", "This changes everything.", undefined)
      .action("She doesn't look up.", [
        { kind: "underline", start: 0, end: 3 },
        { kind: "strike", start: 4, end: 12 },
      ])
      .build(),
});

register({
  name: "revision-marks",
  description: "Revision-colored marks on several lines, simulating a post-table-read pass.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason: "Fountain has no revision-color mark syntax — revision marks are dropped entirely on round-trip.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. HALLWAY - DAY")
      .action("New line added on the blue revision.", [{ kind: "revision", start: 0, end: 3, revisionColor: "Blue" }])
      .exchange("MAYA", "This line changed on pink.")
      .build(),
});

register({
  name: "scene-numbers-present",
  description: "Every scene heading carries an explicit sceneNumber attribute.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder();
    for (let i = 1; i <= 6; i++) {
      b.sceneHeading(`INT. ROOM ${i} - DAY`, String(i));
      b.action(`Something happens in room ${i}.`);
    }
    return b.build();
  },
});

register({
  name: "long-action-paragraphs",
  description: "Word-wrap stress: several very long single action blocks with no internal breaks.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("EXT. DESERT - DAY")
      .action(
        "The heat shimmers off the asphalt in waves that bend the horizon into something almost liquid, and for a moment it looks like the road itself might simply dissolve into the distance, the way everything out here eventually does, given enough time and enough sun and enough of the particular kind of nothing that fills the space between one town and the next.",
      )
      .action(
        "Supercalifragilisticexpialidocious is not, strictly speaking, a word that belongs in a screenplay, but the wrapper needs at least one word longer than any reasonable measure width, and this is the one everybody already knows.",
      )
      .build(),
});

register({
  name: "short-choppy-scenes",
  description: "Many one-line scenes back to back, stressing scene-heading orphan control and keep-together rules.",
  profile: usFeatureProfile,
  build: () => {
    const b = new DocBuilder();
    for (let i = 1; i <= 20; i++) {
      b.sceneHeading(`INT. ROOM ${i} - DAY`);
      b.action("A beat.");
    }
    return b.build();
  },
});

register({
  name: "explicit-page-breaks",
  description: "Manually-forced page_break blocks between otherwise short scenes.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. ROOM A - DAY")
      .action("Something small happens.")
      .pageBreak()
      .sceneHeading("INT. ROOM B - DAY")
      .action("Something else, deliberately starting fresh.")
      .pageBreak()
      .sceneHeading("INT. ROOM C - DAY")
      .action("And a third.")
      .build(),
});

register({
  name: "act-breaks-tv-format",
  description: "A one-hour TV document exercising honorsActBreaks via explicit page_break-style act markers under the TV profile.",
  profile: usTvOneHourProfile,
  build: () =>
    new DocBuilder()
      .section("ACT ONE")
      .sceneHeading("INT. PRECINCT - DAY")
      .action("The bullpen is already loud at 7am.")
      .exchange("DET. ROSS", "Tell me you have something.")
      .section("ACT TWO")
      .sceneHeading("EXT. WAREHOUSE DISTRICT - NIGHT")
      .action("Ross approaches alone, against every instinct.")
      .exchange("DET. ROSS", "I know you're in there.")
      .build(),
});

register({
  name: "mixed-caps-elements",
  description: "Transitions and shots (caps elements) interspersed with mixed-case action/dialogue.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason: "Fountain has no dedicated shot syntax (§8) — shot round-trips as forced action.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. CONTROL ROOM - NIGHT")
      .shot("ON THE MONITOR")
      .action("Static, then a signal.")
      .transition("MATCH CUT TO:")
      .sceneHeading("EXT. SATELLITE DISH - NIGHT")
      .action("It slowly rotates to track the signal.")
      .build(),
});

register({
  name: "nested-parentheticals-and-dialogue",
  description: "A single character cue with parenthetical, dialogue, another parenthetical, and continued dialogue.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. COURTROOM - DAY")
      .character("WITNESS")
      .parenthetical("hesitating")
      .dialogue("I saw him leave around midnight.")
      .parenthetical("beat")
      .dialogue("But I can't be completely sure.")
      .build(),
});

register({
  name: "unicode-and-special-characters",
  description: "Accented names, em-dashes, curly quotes, and other non-ASCII text throughout.",
  profile: usFeatureProfile,
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. CAFÉ RÉNÉ - DAY")
      .action("A chalkboard menu reads: “Plat du jour — café au lait, croissant.”")
      .exchange("JOSÉ", "Ça va, mon ami? — I haven't seen you in years.")
      .build(),
});

register({
  name: "empty-and-blank-heavy",
  description: "Edge-case stress: several blocks with minimal or whitespace-only text scattered through otherwise normal content.",
  profile: usFeatureProfile,
  knownFountainLimitation: {
    reason:
      "A whitespace-only action line is trimmed to empty by Fountain parsing (by design — whitespace-only content has no meaningful representation to preserve), so it doesn't round-trip byte-for-byte.",
    mode: "insensitive",
  },
  build: () =>
    new DocBuilder()
      .sceneHeading("INT. ROOM - DAY")
      .action(" ")
      .character("X")
      .dialogue(".")
      .action("A normal line for contrast.")
      .build(),
});

/** All registered corpus entries, in registration order. */
export const CORPUS: readonly CorpusEntry[] = ENTRIES;
