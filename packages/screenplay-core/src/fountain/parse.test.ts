import { describe, expect, it } from "vitest";
import { parseFountain } from "./parse.js";

function types(source: string): string[] {
  return parseFountain(source).blocks.map((b) => b.type);
}

describe("parseFountain: scene headings", () => {
  it("detects INT./EXT./EST. prefixes", () => {
    expect(types("INT. HOUSE - DAY")).toEqual(["scene_heading"]);
    expect(types("EXT. STREET - NIGHT")).toEqual(["scene_heading"]);
    expect(types("EST. CITY - DAY")).toEqual(["scene_heading"]);
    expect(types("INT./EXT. CAR - DAY")).toEqual(["scene_heading"]);
    expect(types("I/E. CAR - DAY")).toEqual(["scene_heading"]);
  });

  it("forces a scene heading with a leading period", () => {
    const doc = parseFountain(".TITLE ONLY SCENE");
    expect(doc.blocks[0]?.type).toBe("scene_heading");
    expect(doc.blocks[0]?.text).toBe("TITLE ONLY SCENE");
  });

  it("does not treat a double-period line as a forced scene heading", () => {
    expect(types("...ellipsis action line")).toEqual(["action"]);
  });
});

describe("parseFountain: action", () => {
  it("classifies ordinary text as action by default", () => {
    const doc = parseFountain("Maya walks to the door.");
    expect(doc.blocks[0]).toMatchObject({ type: "action", text: "Maya walks to the door." });
  });

  it("forces action with a leading !", () => {
    const doc = parseFountain("!WALL-E LOOKS AROUND.");
    expect(doc.blocks[0]).toMatchObject({ type: "action", text: "WALL-E LOOKS AROUND." });
  });

  it("joins consecutive non-blank action lines into one block", () => {
    const doc = parseFountain("Line one.\nLine two.\nLine three.");
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.text).toBe("Line one. Line two. Line three.");
  });
});

describe("parseFountain: character and dialogue", () => {
  it("recognizes an all-caps line followed by non-blank text as character+dialogue", () => {
    const doc = parseFountain("MAYA\nHello there.");
    expect(doc.blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "Hello there." },
    ]);
  });

  it("does not treat an all-caps line as a character cue without a following non-blank line", () => {
    expect(types("MAYA")).toEqual(["action"]);
    expect(types("MAYA\n\nNext scene stuff.")).toEqual(["action", "action"]);
  });

  it("forces a character cue with a leading @ even when not all-caps", () => {
    const doc = parseFountain("@Maya\nHello there.");
    expect(doc.blocks[0]).toMatchObject({ type: "character", text: "Maya" });
    expect(doc.blocks[1]).toMatchObject({ type: "dialogue", text: "Hello there." });
  });

  it("keeps a character extension as part of the cue text", () => {
    const doc = parseFountain("MAYA (V.O.)\nI'm not here.");
    expect(doc.blocks[0]?.text).toBe("MAYA (V.O.)");
  });

  it("parses a parenthetical between character and dialogue", () => {
    const doc = parseFountain("MAYA\n(beat)\nHello there.");
    expect(doc.blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "character", text: "MAYA" },
      { type: "parenthetical", text: "beat" },
      { type: "dialogue", text: "Hello there." },
    ]);
  });

  it("joins multiple consecutive dialogue lines into one block", () => {
    const doc = parseFountain("MAYA\nLine one.\nLine two.");
    expect(doc.blocks[1]).toMatchObject({ type: "dialogue", text: "Line one. Line two." });
  });
});

describe("parseFountain: dual dialogue", () => {
  it("restructures a ^-suffixed cue and its predecessor into a dual_dialogue group", () => {
    const doc = parseFountain("MAYA\nHello.\n\nSAM^\nHi there.");
    expect(doc.blocks.map((b) => ({ type: b.type, text: b.text, dualColumn: b.attrs.dualColumn }))).toEqual([
      { type: "dual_dialogue", text: "", dualColumn: undefined },
      { type: "character", text: "MAYA", dualColumn: "left" },
      { type: "dialogue", text: "Hello.", dualColumn: "left" },
      { type: "character", text: "SAM", dualColumn: "right" },
      { type: "dialogue", text: "Hi there.", dualColumn: "right" },
    ]);
  });

  it("supports a forced @ cue combined with the dual-dialogue caret", () => {
    const doc = parseFountain("MAYA\nHello.\n\n@Sam^\nHi there.");
    const cue = doc.blocks.find((b) => b.text === "Sam");
    expect(cue).toMatchObject({ type: "character", attrs: { dualColumn: "right" } });
  });

  it("degrades gracefully (no throw) when ^ appears with nothing to pair with", () => {
    expect(() => parseFountain("MAYA^\nHello.")).not.toThrow();
    const doc = parseFountain("MAYA^\nHello.");
    expect(doc.blocks[0]?.type).toBe("character");
  });
});

describe("parseFountain: transitions and centered text", () => {
  it("detects a natural ALL-CAPS '* TO:' transition", () => {
    expect(types("CUT TO:")).toEqual(["transition"]);
  });

  it("forces a transition with a leading >", () => {
    const doc = parseFountain(">FADE OUT.");
    expect(doc.blocks[0]).toMatchObject({ type: "transition", text: "FADE OUT." });
  });

  it("parses centered text wrapped in >...<", () => {
    const doc = parseFountain(">THE END<");
    expect(doc.blocks[0]).toMatchObject({ type: "centered", text: "THE END" });
  });

  it("does not misclassify ordinary lowercase text ending in 'to:' as a transition", () => {
    expect(types("talking to: someone about stuff")).toEqual(["action"]);
  });
});

describe("parseFountain: lyric", () => {
  it("parses ~-prefixed lines as lyric, preserving line breaks", () => {
    const doc = parseFountain("~Roses are red\n~Violets are blue");
    expect(doc.blocks[0]).toMatchObject({ type: "lyric", text: "Roses are red\nViolets are blue" });
  });
});

describe("parseFountain: sections and synopses", () => {
  it("parses a # line as a section, stripping the marker", () => {
    expect(parseFountain("# Act One").blocks[0]).toMatchObject({ type: "section", text: "Act One" });
  });

  it("parses nested ## sections the same way (no depth tracking)", () => {
    expect(parseFountain("## Sequence Two").blocks[0]).toMatchObject({ type: "section", text: "Sequence Two" });
  });

  it("parses a = line as a synopsis, not confusing it with a page break", () => {
    expect(parseFountain("= A brief summary.").blocks[0]).toMatchObject({
      type: "synopsis",
      text: "A brief summary.",
    });
  });
});

describe("parseFountain: notes and boneyard", () => {
  it("parses a standalone [[note]] as a note block", () => {
    expect(parseFountain("[[Fix this scene later]]").blocks[0]).toMatchObject({
      type: "note",
      text: "Fix this scene later",
    });
  });

  it("parses a standalone /* boneyard */ comment as a note block", () => {
    expect(parseFountain("/* cut for time */").blocks[0]).toMatchObject({
      type: "note",
      text: "cut for time",
    });
  });

  it("handles a multi-line boneyard comment", () => {
    const doc = parseFountain("/* this spans\nmultiple lines */");
    expect(doc.blocks[0]?.type).toBe("note");
    expect(doc.blocks[0]?.text).toContain("this spans");
  });
});

describe("parseFountain: page breaks", () => {
  it("parses a line of === as a page_break", () => {
    expect(types("Some action.\n\n===\n\nMore action.")).toEqual(["action", "page_break", "action"]);
  });
});

describe("parseFountain: title page", () => {
  it("extracts leading Key: Value lines into a title_page block", () => {
    const doc = parseFountain("Title: My Screenplay\nAuthor: Jane Doe\n\nINT. HOUSE - DAY");
    expect(doc.blocks[0]).toMatchObject({ type: "title_page" });
    expect(doc.blocks[0]?.text).toBe("Title: My Screenplay\nAuthor: Jane Doe");
    expect(doc.blocks[1]?.type).toBe("scene_heading");
  });

  it("does not create a title page block when the document doesn't start with Key: syntax", () => {
    const doc = parseFountain("INT. HOUSE - DAY");
    expect(doc.blocks[0]?.type).toBe("scene_heading");
  });
});

describe("parseFountain: emphasis", () => {
  it("decodes bold/italic/underline into marks and strips the syntax from text", () => {
    const doc = parseFountain("!Some **bold** and *italic* and _underline_ text.");
    const block = doc.blocks[0]!;
    expect(block.text).toBe("Some bold and italic and underline text.");
    expect(block.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "bold" }),
        expect.objectContaining({ kind: "italic" }),
        expect.objectContaining({ kind: "underline" }),
      ]),
    );
  });
});

describe("parseFountain: never throws on arbitrary input", () => {
  it("handles empty input", () => {
    expect(() => parseFountain("")).not.toThrow();
    expect(parseFountain("").blocks).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    expect(() => parseFountain("\n\n   \n\n")).not.toThrow();
  });
});
