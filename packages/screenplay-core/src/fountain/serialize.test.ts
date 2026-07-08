import { describe, expect, it } from "vitest";
import type { Block, ScreenplayDocument } from "../model.js";
import { serializeFountain } from "./serialize.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

function doc(blocks: Block[]): ScreenplayDocument {
  return { blocks };
}

describe("serializeFountain: forced markers", () => {
  it("always forces scene_heading with a leading period", () => {
    const out = serializeFountain(doc([block({ type: "scene_heading", text: "random text" })]));
    expect(out).toBe(".random text");
  });

  it("always forces action with a leading !", () => {
    const out = serializeFountain(doc([block({ type: "action", text: "random text" })]));
    expect(out).toBe("!random text");
  });

  it("always forces character with a leading @", () => {
    const out = serializeFountain(doc([block({ type: "character", text: "random text" })]));
    expect(out).toBe("@random text");
  });

  it("always forces transition with a leading >", () => {
    const out = serializeFountain(doc([block({ type: "transition", text: "random text" })]));
    expect(out).toBe(">random text");
  });

  it("serializes shot as forced action (no dedicated Fountain syntax)", () => {
    const out = serializeFountain(doc([block({ type: "shot", text: "ANGLE ON" })]));
    expect(out).toBe("!ANGLE ON");
  });

  it("appends a scene heading's sceneNumber as a trailing #N# (§8)", () => {
    const out = serializeFountain(doc([block({ type: "scene_heading", text: "INT. HOUSE - DAY", attrs: { sceneNumber: "114A" } })]));
    expect(out).toBe(".INT. HOUSE - DAY #114A#");
  });

  it("omits the trailing #N# entirely when sceneNumber is absent", () => {
    const out = serializeFountain(doc([block({ type: "scene_heading", text: "INT. HOUSE - DAY" })]));
    expect(out).toBe(".INT. HOUSE - DAY");
  });
});

describe("serializeFountain: wrapping syntax", () => {
  it("wraps parenthetical in parens", () => {
    expect(serializeFountain(doc([block({ type: "parenthetical", text: "beat" })]))).toBe("(beat)");
  });

  it("wraps centered text in >...<", () => {
    expect(serializeFountain(doc([block({ type: "centered", text: "THE END" })]))).toBe(">THE END<");
  });

  it("wraps note in [[...]]", () => {
    expect(serializeFountain(doc([block({ type: "note", text: "fix later" })]))).toBe("[[fix later]]");
  });

  it("prefixes each lyric line with ~, preserving line breaks", () => {
    const out = serializeFountain(doc([block({ type: "lyric", text: "line one\nline two" })]));
    expect(out).toBe("~line one\n~line two");
  });

  it("prefixes section with #", () => {
    expect(serializeFountain(doc([block({ type: "section", text: "Act One" })]))).toBe("# Act One");
  });

  it("prefixes synopsis with =", () => {
    expect(serializeFountain(doc([block({ type: "synopsis", text: "A summary." })]))).toBe("= A summary.");
  });

  it("renders page_break as ===", () => {
    expect(serializeFountain(doc([block({ type: "page_break", text: "" })]))).toBe("===");
  });

  it("renders title_page text verbatim", () => {
    const text = "Title: My Screenplay\nAuthor: Jane Doe";
    expect(serializeFountain(doc([block({ type: "title_page", text })]))).toBe(text);
  });

  it("renders dual_dialogue marker as contributing no text", () => {
    expect(serializeFountain(doc([block({ type: "dual_dialogue", text: "" })]))).toBe("");
  });
});

describe("serializeFountain: dialogue exchange spacing", () => {
  it("joins character->dialogue with a single newline (no blank line)", () => {
    const out = serializeFountain(
      doc([block({ type: "character", text: "MAYA" }), block({ type: "dialogue", text: "Hi." })]),
    );
    expect(out).toBe("@MAYA\nHi.");
  });

  it("joins character->parenthetical->dialogue with single newlines throughout", () => {
    const out = serializeFountain(
      doc([
        block({ type: "character", text: "MAYA" }),
        block({ type: "parenthetical", text: "beat" }),
        block({ type: "dialogue", text: "Hi." }),
      ]),
    );
    expect(out).toBe("@MAYA\n(beat)\nHi.");
  });

  it("separates unrelated blocks with a blank line", () => {
    const out = serializeFountain(
      doc([block({ type: "action", text: "One." }), block({ type: "action", text: "Two." })]),
    );
    expect(out).toBe("!One.\n\n!Two.");
  });

  it("puts a blank line between a dialogue exchange and whatever follows", () => {
    const out = serializeFountain(
      doc([
        block({ type: "character", text: "MAYA" }),
        block({ type: "dialogue", text: "Hi." }),
        block({ type: "action", text: "She leaves." }),
      ]),
    );
    expect(out).toBe("@MAYA\nHi.\n\n!She leaves.");
  });

  it("marks the second cue of a dual-dialogue pair with a trailing ^", () => {
    const out = serializeFountain(
      doc([
        block({ type: "dual_dialogue", text: "" }),
        block({ type: "character", text: "MAYA", attrs: { dualColumn: "left" } }),
        block({ type: "dialogue", text: "Hi.", attrs: { dualColumn: "left" } }),
        block({ type: "character", text: "SAM", attrs: { dualColumn: "right" } }),
        block({ type: "dialogue", text: "Hey.", attrs: { dualColumn: "right" } }),
      ]),
    );
    expect(out).toBe("@MAYA\nHi.\n\n@SAM^\nHey.");
  });
});

describe("serializeFountain: emphasis", () => {
  it("encodes marks using Fountain emphasis syntax", () => {
    const out = serializeFountain(
      doc([block({ type: "action", text: "bold text", marks: [{ kind: "bold", start: 0, end: 4 }] })]),
    );
    expect(out).toBe("!**bold** text");
  });
});

describe("serializeFountain: empty document", () => {
  it("returns an empty string for a document with no blocks", () => {
    expect(serializeFountain(doc([]))).toBe("");
  });
});
