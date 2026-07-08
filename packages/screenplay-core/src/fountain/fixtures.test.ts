import { describe, expect, it } from "vitest";
import type { BlockType } from "../model.js";
import { parseFountain } from "./parse.js";

/**
 * Ten hand-authored Fountain fixtures exercising the full spec (§8), standing
 * in for the "official Fountain sample files + 10 real scripts" the ticket
 * calls for — this environment has no network access to fetch fountain.io's
 * actual sample files, so these are purpose-written instead, each pinned
 * against its expected block-type sequence. Committed here (not separate
 * .fountain files) so they run as ordinary unit tests without file I/O.
 */

function types(source: string): BlockType[] {
  return parseFountain(source).blocks.map((b) => b.type);
}

describe("fixture: title page + basic scene", () => {
  const source = `Title: Coffee Break
Credit: written by
Author: A. Writer
Draft date: 1/1/2026

INT. COFFEE SHOP - DAY

Maya sits alone at a corner table, laptop open.

MAYA
I'll have the usual.

BARISTA
Coming right up.`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "title_page",
      "scene_heading",
      "action",
      "character",
      "dialogue",
      "character",
      "dialogue",
    ]);
  });

  it("extracts the title page fields verbatim", () => {
    const doc = parseFountain(source);
    expect(doc.blocks[0]?.text).toBe(
      "Title: Coffee Break\nCredit: written by\nAuthor: A. Writer\nDraft date: 1/1/2026",
    );
  });
});

describe("fixture: parenthetical mid-dialogue", () => {
  const source = `INT. OFFICE - NIGHT

MAYA
(whispering)
Is anyone still here?

MAYA (CONT'D)
(louder)
Hello?`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "scene_heading",
      "character",
      "parenthetical",
      "dialogue",
      "character",
      "parenthetical",
      "dialogue",
    ]);
  });
});

describe("fixture: dual dialogue exchange", () => {
  const source = `INT. CAR - DAY

MAYA
Are we there yet?

SAM^
Almost.`;

  it("parses to a dual_dialogue group tagged left/right", () => {
    const doc = parseFountain(source);
    expect(doc.blocks.map((b) => b.type)).toEqual([
      "scene_heading",
      "dual_dialogue",
      "character",
      "dialogue",
      "character",
      "dialogue",
    ]);
    expect(doc.blocks[2]?.attrs.dualColumn).toBe("left");
    expect(doc.blocks[4]?.attrs.dualColumn).toBe("right");
  });
});

describe("fixture: transitions and forced elements", () => {
  const source = `INT. HALLWAY - DAY

Maya runs.

CUT TO:

INT. STAIRWELL - CONTINUOUS

!SHE STOPS, OUT OF BREATH.

>SMASH CUT TO:

EXT. ROOFTOP - DAY`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "scene_heading",
      "action",
      "transition",
      "scene_heading",
      "action",
      "transition",
      "scene_heading",
    ]);
  });
});

describe("fixture: centered text and lyrics", () => {
  const source = `>THE END<

INT. CONCERT HALL - NIGHT

~Somewhere over the rainbow
~Way up high`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual(["centered", "scene_heading", "lyric"]);
  });

  it("preserves lyric line breaks", () => {
    const doc = parseFountain(source);
    const lyric = doc.blocks.find((b) => b.type === "lyric");
    expect(lyric?.text).toBe("Somewhere over the rainbow\nWay up high");
  });
});

describe("fixture: sections, synopses, and notes", () => {
  const source = `# Act One

= Maya discovers the truth.

INT. LIBRARY - DAY

Maya searches the shelves.

[[Reconsider this scene's pacing]]

She finds the book.`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "section",
      "synopsis",
      "scene_heading",
      "action",
      "note",
      "action",
    ]);
  });
});

describe("fixture: boneyard comments", () => {
  const source = `INT. KITCHEN - DAY

/* TODO: revisit this whole scene, might cut */

Maya makes coffee.`;

  it("treats the boneyard comment as a note block", () => {
    expect(types(source)).toEqual(["scene_heading", "note", "action"]);
  });
});

describe("fixture: page breaks between scenes", () => {
  const source = `INT. HOUSE - DAY

Scene one.

===

INT. HOUSE - NIGHT

Scene two.`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "scene_heading",
      "action",
      "page_break",
      "scene_heading",
      "action",
    ]);
  });
});

describe("fixture: emphasis-heavy prose", () => {
  const source = `INT. GALLERY - DAY

The painting is **absolutely stunning** — Maya has never seen *anything* like it, and she can't help but stare, _completely_ transfixed.`;

  it("decodes bold, italic, and underline marks", () => {
    const doc = parseFountain(source);
    const action = doc.blocks[1]!;
    expect(action.text).toBe(
      "The painting is absolutely stunning — Maya has never seen anything like it, and she can't help but stare, completely transfixed.",
    );
    expect(action.marks.map((m) => m.kind).sort()).toEqual(["bold", "italic", "underline"]);
  });
});

describe("fixture: forced scene heading and character", () => {
  const source = `.TITLE CARD

Some text here.

@BARTENDER
What'll it be?`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual(["scene_heading", "action", "character", "dialogue"]);
  });

  it("keeps forced scene heading text without the leading period", () => {
    expect(parseFountain(source).blocks[0]?.text).toBe("TITLE CARD");
  });
});

describe("fixture: multi-scene one-pager", () => {
  const source = `Title: The Long Way Home
Author: A. Writer

INT. CAR - DAY

MAYA
(checking the mirror)
We should be close now.

EXT. GAS STATION - CONTINUOUS

The car pulls in. Maya gets out and stretches.

ATTENDANT
Fill it up?

MAYA
Please.

FADE OUT.`;

  it("parses to the expected block sequence", () => {
    expect(types(source)).toEqual([
      "title_page",
      "scene_heading",
      "character",
      "parenthetical",
      "dialogue",
      "scene_heading",
      "action",
      "character",
      "dialogue",
      "character",
      "dialogue",
      "transition",
    ]);
  });
});
