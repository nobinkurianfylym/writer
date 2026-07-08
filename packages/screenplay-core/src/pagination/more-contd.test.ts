import { describe, expect, it } from "vitest";
import type { Block, BlockType, ScreenplayDocument } from "../model.js";
import { parseFormatProfile, type FormatProfile } from "../format-profile.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { paginate } from "./solver.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

/** Zero-spacing us-feature clone with a small linesPerPage, for exact control over splits. */
function preciseProfile(overrides: Partial<FormatProfile["pagination"]> = {}): FormatProfile {
  const raw = JSON.parse(JSON.stringify(usFeatureProfile)) as FormatProfile;
  for (const type of Object.keys(raw.elements) as BlockType[]) {
    raw.elements[type] = { ...raw.elements[type], spaceBefore: 0, spaceAfter: 0 };
  }
  raw.pagination = { ...raw.pagination, linesPerPage: 10, minOrphanLines: 2, ...overrides };
  return parseFormatProfile(raw);
}

/** Dialogue text guaranteed to wrap to exactly 15 lines at us-feature's dialogue width (35 chars/line). */
function longDialogue(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Word${i}`.padEnd(34, "x")).join(" ");
}

describe("paginate: MORE/CONT'D synthesis on a dialogue split", () => {
  it("inserts (MORE) at the bottom of the earlier page and CHARACTER (CONT'D) at the top of the next, within budget", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "char", type: "character", text: "MAYA" }),
        block({ id: "dia", type: "dialogue", text: longDialogue(15) }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages.length).toBeGreaterThanOrEqual(2);

    for (const page of map.pages) {
      expect(page.lines.length).toBeLessThanOrEqual(profile.pagination.linesPerPage);
    }

    const page1 = map.pages[0]!;
    const last = page1.lines.at(-1)!;
    expect(last.synthetic).toBe(true);
    expect(last.blockType).toBe("parenthetical");
    expect(last.text).toBe(profile.pagination.moreText);

    const page2 = map.pages[1]!;
    const first = page2.lines[0]!;
    expect(first.synthetic).toBe(true);
    expect(first.blockType).toBe("character");
    expect(first.text).toBe(`MAYA ${profile.pagination.continuedText}`);
  });

  it("preserves an existing character extension in the CONT'D cue", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "char", type: "character", text: "MAYA (V.O.)" }),
        block({ id: "dia", type: "dialogue", text: longDialogue(15) }),
      ],
    };
    const map = paginate(doc, profile);
    const cont = map.pages[1]!.lines[0]!;
    expect(cont.text).toBe("MAYA (V.O.) (CONT'D)");
  });

  it("does not insert synthetic lines when the dialogue block fits on one page", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "char", type: "character", text: "MAYA" }),
        block({ id: "dia", type: "dialogue", text: "Hello there." }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages).toHaveLength(1);
    expect(map.pages[0]!.lines.some((l) => l.synthetic)).toBe(false);
  });

  it("skips the CONT'D cue (but still inserts MORE) when no preceding character block exists", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      // Malformed on purpose: dialogue with no character cue before it.
      blocks: [block({ id: "dia", type: "dialogue", text: longDialogue(15) })],
    };
    let map;
    expect(() => {
      map = paginate(doc, profile);
    }).not.toThrow();
    const page1 = map!.pages[0]!;
    expect(page1.lines.at(-1)!.synthetic).toBe(true);
    const page2 = map!.pages[1]!;
    expect(page2.lines[0]!.synthetic).toBeUndefined();
  });

  it("does not add MORE/CONT'D markers for a split action block", () => {
    const profile = preciseProfile();
    const longText = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} in a long paragraph.`).join(
      " ",
    );
    const doc: ScreenplayDocument = {
      blocks: [block({ id: "long", type: "action", text: longText })],
    };
    const map = paginate(doc, profile);
    expect(map.pages.length).toBeGreaterThan(1);
    for (const page of map.pages) {
      expect(page.lines.some((l) => l.synthetic)).toBe(false);
    }
  });

  it("handles a dialogue block needing more than one split, staying within budget on every page", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "char", type: "character", text: "MAYA" }),
        block({ id: "dia", type: "dialogue", text: longDialogue(40) }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages.length).toBeGreaterThan(2);
    for (const page of map.pages) {
      expect(page.lines.length).toBeLessThanOrEqual(profile.pagination.linesPerPage);
    }
    // The whole document is just [character, dialogue], so every page
    // boundary is a continuation of the same dialogue block: every page but
    // the last ends with a synthetic (MORE), every page but the first
    // starts with a synthetic CONT'D.
    for (let i = 0; i < map.pages.length - 1; i++) {
      expect(map.pages[i]!.lines.at(-1)!.synthetic).toBe(true);
    }
    for (let i = 1; i < map.pages.length; i++) {
      expect(map.pages[i]!.lines[0]!.synthetic).toBe(true);
    }
  });
});
