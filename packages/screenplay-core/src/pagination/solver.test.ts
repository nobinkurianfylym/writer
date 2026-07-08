import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, BlockType, ScreenplayDocument } from "../model.js";
import { parseFormatProfile, type FormatProfile } from "../format-profile.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { usTvOneHourProfile } from "../profiles/us-tv-onehour.js";
import { arbitraryDocument } from "../testing.js";
import { layoutDocument } from "./layout.js";
import { paginate } from "./solver.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

/** us-feature with a small linesPerPage, for cheaply forcing multi-page docs. */
function testProfile(overrides: Partial<FormatProfile["pagination"]> = {}): FormatProfile {
  const raw = JSON.parse(JSON.stringify(usFeatureProfile)) as FormatProfile;
  raw.pagination = { ...raw.pagination, linesPerPage: 10, ...overrides };
  return parseFormatProfile(raw);
}

/**
 * Same, but with every element's spaceBefore/spaceAfter zeroed — so a
 * short, one-line block is exactly 1 layout line, making padding arithmetic
 * in hand-crafted boundary tests exact instead of profile-spacing-dependent.
 */
function preciseProfile(overrides: Partial<FormatProfile["pagination"]> = {}): FormatProfile {
  const raw = JSON.parse(JSON.stringify(usFeatureProfile)) as FormatProfile;
  for (const type of Object.keys(raw.elements) as BlockType[]) {
    raw.elements[type] = { ...raw.elements[type], spaceBefore: 0, spaceAfter: 0 };
  }
  raw.pagination = { ...raw.pagination, linesPerPage: 10, ...overrides };
  return parseFormatProfile(raw);
}

function totalFlatLines(doc: ScreenplayDocument, profile: FormatProfile): number {
  return layoutDocument(doc, profile).reduce((sum, u) => sum + u.lines.length, 0);
}

function pad(count: number): Block[] {
  return Array.from({ length: count }, (_, i) => block({ id: `pad${i}`, type: "action", text: "X" }));
}

describe("paginate: basic fit", () => {
  it("fits everything on one page when it's well under the limit", () => {
    const profile = testProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "1", type: "scene_heading", text: "INT. HOUSE - DAY" }),
        block({ id: "2", type: "action", text: "Maya enters." }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages).toHaveLength(1);
    expect(map.pages[0]?.lines.length).toBe(totalFlatLines(doc, profile));
  });

  it("returns zero pages for an empty document", () => {
    expect(paginate({ blocks: [] }, testProfile()).pages).toEqual([]);
  });
});

describe("paginate: total line conservation", () => {
  it("never drops or duplicates a line across pages", () => {
    const profile = testProfile();
    const doc: ScreenplayDocument = {
      blocks: Array.from({ length: 20 }, (_, i) =>
        block({ id: `a${i}`, type: "action", text: `Action paragraph number ${i}.` }),
      ),
    };
    const map = paginate(doc, profile);
    const totalPaginated = map.pages.reduce((sum, p) => sum + p.lines.length, 0);
    expect(totalPaginated).toBe(totalFlatLines(doc, profile));
    expect(map.pages.length).toBeGreaterThan(1);
  });
});

describe("paginate: no orphaned scene headings", () => {
  it("moves a scene heading to the next page rather than stranding it", () => {
    // precise profile: 9 padding lines fill 9 of 10 slots on page 1, leaving
    // room for only 1 more line. A scene heading needing itself (1 line) +
    // 3 following lines (sceneHeadingMinLinesBeforeBreak) cannot fit there.
    const profile = preciseProfile({ sceneHeadingMinLinesBeforeBreak: 3 });
    const doc: ScreenplayDocument = {
      blocks: [
        ...pad(9),
        block({ id: "heading", type: "scene_heading", text: "INT. HOUSE - DAY" }),
        block({ id: "after1", type: "action", text: "One." }),
        block({ id: "after2", type: "action", text: "Two." }),
        block({ id: "after3", type: "action", text: "Three." }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "heading")).toBe(false);

    const headingPageIndex = map.pages.findIndex((p) => p.lines.some((l) => l.blockId === "heading"));
    expect(headingPageIndex).toBeGreaterThan(0);
    const headingPage = map.pages[headingPageIndex]!;
    const headingLineIdx = headingPage.lines.findIndex((l) => l.blockId === "heading");
    // heading itself + at least 3 following lines, all on the same page.
    expect(headingPage.lines.length - headingLineIdx).toBeGreaterThanOrEqual(4);
  });
});

describe("paginate: parenthetical never separated from first dialogue line", () => {
  it("moves both to the next page together when they'd otherwise split", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        ...pad(9),
        block({ id: "paren", type: "parenthetical", text: "(beat)" }),
        block({ id: "dia", type: "dialogue", text: "Hello there." }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "paren")).toBe(false);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "dia")).toBe(false);
    const nextPage = map.pages[1];
    expect(nextPage?.lines.some((l) => l.blockId === "paren")).toBe(true);
    expect(nextPage?.lines.some((l) => l.blockId === "dia")).toBe(true);
  });
});

describe("paginate: character cue never left alone at the bottom of a page", () => {
  it("moves the character cue and its dialogue's first line together", () => {
    const profile = preciseProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        ...pad(9),
        block({ id: "char", type: "character", text: "MAYA" }),
        block({ id: "dia", type: "dialogue", text: "Hello there, how are you today?" }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "char")).toBe(false);
    const nextPage = map.pages[1];
    expect(nextPage?.lines.some((l) => l.blockId === "char")).toBe(true);
    expect(nextPage?.lines.some((l) => l.blockId === "dia")).toBe(true);
  });
});

describe("paginate: action/dialogue widow control", () => {
  it("splits a long action block across pages, respecting minOrphanLines on both sides", () => {
    const profile = preciseProfile({ minOrphanLines: 2 });
    const longText = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} in a long paragraph.`).join(
      " ",
    );
    const doc: ScreenplayDocument = {
      blocks: [...pad(7), block({ id: "long", type: "action", text: longText })],
    };
    const map = paginate(doc, profile);
    expect(map.pages.length).toBeGreaterThan(1);
    const linesOnPage1 = map.pages[0]!.lines.filter((l) => l.blockId === "long").length;
    const linesOnPage2 = map.pages[1]!.lines.filter((l) => l.blockId === "long").length;
    expect(linesOnPage1).toBeGreaterThanOrEqual(2);
    expect(linesOnPage2).toBeGreaterThanOrEqual(2);
  });

  it("moves the whole block instead of a split that would violate minOrphanLines", () => {
    // 9 padding lines leave only 1 line of room on page 1; a dialogue block
    // wrapping to >= 2 lines can't leave >= minOrphanLines(2) on page 1, so
    // it must move whole to page 2 rather than split 1/N.
    const profile = preciseProfile({ minOrphanLines: 2 });
    const doc: ScreenplayDocument = {
      blocks: [...pad(9), block({ id: "dia", type: "dialogue", text: "word ".repeat(20) })],
    };
    const map = paginate(doc, profile);
    expect(map.pages[0]!.lines.some((l) => l.blockId === "dia")).toBe(false);
    expect(map.pages[1]!.lines.filter((l) => l.blockId === "dia").length).toBeGreaterThanOrEqual(2);
  });
});

describe("paginate: explicit page_break blocks", () => {
  it("forces a new page even when the current page isn't full", () => {
    const profile = testProfile();
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "1", type: "action", text: "Before the break." }),
        block({ id: "pb", type: "page_break" }),
        block({ id: "2", type: "action", text: "After the break." }),
      ],
    };
    const map = paginate(doc, profile);
    expect(map.pages).toHaveLength(2);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "1")).toBe(true);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "2")).toBe(false);
    expect(map.pages[1]?.lines.some((l) => l.blockId === "2")).toBe(true);
  });

  it("does not force a leading blank page when the break is at the very start", () => {
    const profile = testProfile();
    const doc: ScreenplayDocument = {
      blocks: [block({ id: "pb", type: "page_break" }), block({ id: "1", type: "action", text: "Hi." })],
    };
    const map = paginate(doc, profile);
    expect(map.pages).toHaveLength(1);
  });
});

describe("paginate: act breaks (honorsActBreaks)", () => {
  const doc: ScreenplayDocument = {
    blocks: [
      block({ id: "1", type: "action", text: "Before the act break." }),
      block({ id: "sec", type: "section", text: "ACT TWO" }),
      block({ id: "2", type: "action", text: "After the act break." }),
    ],
  };

  it("forces a page break at a section boundary for us-tv-onehour", () => {
    const raw = JSON.parse(JSON.stringify(usTvOneHourProfile)) as FormatProfile;
    raw.pagination.linesPerPage = 10;
    const map = paginate(doc, parseFormatProfile(raw));
    expect(map.pages).toHaveLength(2);
    expect(map.pages[0]?.lines.some((l) => l.blockId === "2")).toBe(false);
  });

  it("does not force a page break at a section boundary for us-feature", () => {
    const map = paginate(doc, testProfile());
    expect(map.pages).toHaveLength(1);
  });
});

describe("paginate: determinism", () => {
  it("produces a byte-identical PageMap for the same input", () => {
    const profile = testProfile();
    const doc: ScreenplayDocument = {
      blocks: Array.from({ length: 15 }, (_, i) =>
        block({ id: `a${i}`, type: i % 3 === 0 ? "scene_heading" : "action", text: `Text ${i}` }),
      ),
    };
    expect(paginate(doc, profile)).toEqual(paginate(doc, profile));
  });
});

describe("paginate: never throws, conserves total line count (property)", () => {
  it("holds for arbitrary valid documents against both shipped profiles", () => {
    fc.assert(
      fc.property(
        arbitraryDocument,
        fc.constantFrom(usFeatureProfile, usTvOneHourProfile),
        (doc, profile) => {
          let map: ReturnType<typeof paginate> | undefined;
          expect(() => {
            map = paginate(doc, profile);
          }).not.toThrow();
          const totalPaginated = map!.pages.reduce((sum, p) => sum + p.lines.length, 0);
          expect(totalPaginated).toBe(totalFlatLines(doc, profile));
        },
      ),
      { numRuns: 2000 },
    );
  });
});
