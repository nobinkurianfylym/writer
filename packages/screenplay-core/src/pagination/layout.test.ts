import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, ScreenplayDocument } from "../model.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { arbitraryBlock } from "../testing.js";
import { wrapText, wrapTextWithOffsets } from "./line-metrics.js";
import { STRUCTURAL_MARKER_TYPES, layoutBlock, layoutDocument } from "./layout.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

describe("layoutBlock: spacing + content", () => {
  it("lays out a short action line: spaceBefore blank(s) + one content line", () => {
    const b = block({ id: "a1", type: "action", text: "Maya walks in." });
    const unit = layoutBlock(b, usFeatureProfile.elements.action);
    expect(unit.lines).toEqual([
      { blockId: "a1", blockType: "action", lineIndexInBlock: -1, totalLinesInBlock: 1, text: "", isBlank: true },
      {
        blockId: "a1",
        blockType: "action",
        lineIndexInBlock: 0,
        totalLinesInBlock: 1,
        text: "Maya walks in.",
        isBlank: false,
      },
    ]);
  });

  it("lays out a scene heading with 2 blanks before, 1 after", () => {
    const b = block({ id: "s1", type: "scene_heading", text: "INT. HOUSE - DAY" });
    const unit = layoutBlock(b, usFeatureProfile.elements.scene_heading);
    const blanks = unit.lines.filter((l) => l.isBlank).length;
    const content = unit.lines.filter((l) => !l.isBlank);
    expect(blanks).toBe(3); // spaceBefore 2 + spaceAfter 1
    expect(content).toEqual([
      {
        blockId: "s1",
        blockType: "scene_heading",
        lineIndexInBlock: 0,
        totalLinesInBlock: 1,
        text: "INT. HOUSE - DAY",
        isBlank: false,
      },
    ]);
  });

  it("wraps a long action paragraph to multiple sequentially-indexed content lines", () => {
    const text =
      "Maya walks slowly across the room toward the window, watching the rain fall on the empty street below her apartment.";
    const b = block({ id: "a2", type: "action", text });
    const unit = layoutBlock(b, usFeatureProfile.elements.action);
    const expectedLines = wrapText(text, usFeatureProfile.elements.action.width);
    const content = unit.lines.filter((l) => !l.isBlank);
    expect(content.map((l) => l.text)).toEqual(expectedLines);
    expect(content.map((l) => l.lineIndexInBlock)).toEqual(expectedLines.map((_, i) => i));
    expect(content.every((l) => l.totalLinesInBlock === expectedLines.length)).toBe(true);
  });
});

describe("layoutBlock: structural markers contribute zero content lines", () => {
  it("a dual_dialogue marker produces only its spacer lines, no content", () => {
    const b = block({ id: "m1", type: "dual_dialogue", text: "" });
    const unit = layoutBlock(b, usFeatureProfile.elements.dual_dialogue);
    expect(unit.lines.every((l) => l.isBlank)).toBe(true);
    expect(unit.lines).toHaveLength(usFeatureProfile.elements.dual_dialogue.spaceBefore);
  });

  it("a page_break contributes zero lines, ignoring any text", () => {
    const b = block({ id: "p1", type: "page_break", text: "ignored" });
    const unit = layoutBlock(b, usFeatureProfile.elements.page_break);
    expect(unit.lines).toHaveLength(0);
  });

  it("a title_page block contributes zero lines to the body flow", () => {
    const b = block({ id: "t1", type: "title_page", text: "ignored" });
    const unit = layoutBlock(b, usFeatureProfile.elements.title_page);
    expect(unit.lines).toHaveLength(0);
  });
});

describe("layoutDocument", () => {
  it("produces one LayoutUnit per block, in order, with matching blockIds", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "1", type: "scene_heading", text: "INT. HOUSE - DAY" }),
        block({ id: "2", type: "action", text: "Maya enters." }),
        block({ id: "3", type: "character", text: "MAYA" }),
        block({ id: "4", type: "dialogue", text: "Hello?" }),
      ],
    };
    const units = layoutDocument(doc, usFeatureProfile);
    expect(units.map((u) => u.blockId)).toEqual(["1", "2", "3", "4"]);
    expect(units.map((u) => u.blockType)).toEqual([
      "scene_heading",
      "action",
      "character",
      "dialogue",
    ]);
  });

  it("returns an empty array for an empty document", () => {
    expect(layoutDocument({ blocks: [] }, usFeatureProfile)).toEqual([]);
  });
});

describe("layoutBlock: mark slicing across wrapped lines", () => {
  it("omits `marks` entirely when the block has none", () => {
    const b = block({ id: "a1", type: "action", text: "Maya walks in." });
    const unit = layoutBlock(b, usFeatureProfile.elements.action);
    for (const line of unit.lines) expect(line.marks).toBeUndefined();
  });

  it("rebases a mark spanning a wrap boundary onto each affected line, relative to that line's own text", () => {
    // At the action element's 6in measure this wraps to three lines, with
    // "window," ending line 1 and "watching" starting line 2 — so a mark
    // from "window" through "watching" spans that boundary.
    const text =
      "Maya walks slowly across the room toward the window, watching the rain fall on the empty street below her apartment.";
    const boldStart = text.indexOf("window");
    const boldEnd = text.indexOf("watching") + "watching".length;
    const b = block({
      id: "a2",
      type: "action",
      text,
      marks: [{ kind: "bold", start: boldStart, end: boldEnd }],
    });
    const style = usFeatureProfile.elements.action;
    const unit = layoutBlock(b, style);
    const content = unit.lines.filter((l) => !l.isBlank);
    const wrapped = wrapTextWithOffsets(text, style.width);
    expect(content.length).toBe(wrapped.length);

    for (let i = 0; i < content.length; i++) {
      const line = content[i]!;
      const { start: lineGlobalStart, end: lineGlobalEnd } = wrapped[i]!;
      const overlapStart = Math.max(boldStart, lineGlobalStart);
      const overlapEnd = Math.min(boldEnd, lineGlobalEnd);
      if (overlapStart < overlapEnd) {
        expect(line.marks).toEqual([{ kind: "bold", start: overlapStart - lineGlobalStart, end: overlapEnd - lineGlobalStart }]);
      } else {
        expect(line.marks).toBeUndefined();
      }
    }
    // Sanity: the mark actually does span a wrap boundary in this fixture.
    expect(content.filter((l) => l.marks !== undefined).length).toBeGreaterThan(1);
  });

  it("property: every mark on a line, when sliced back out of that line's text, is non-empty and in range", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => /\S/.test(s)),
        fc.array(fc.nat({ max: 199 }), { minLength: 0, maxLength: 4 }),
        (text, offsets) => {
          const maxIdx = text.length - 1;
          const marks = offsets
            .filter((o) => o <= maxIdx)
            .map((o, i): { kind: "bold"; start: number; end: number } => ({
              kind: "bold",
              start: Math.min(o, maxIdx),
              end: Math.min(o + 1 + (i % 5), text.length),
            }))
            .filter((m) => m.start < m.end);
          const b = block({ id: "p", type: "action", text, marks });
          const unit = layoutBlock(b, usFeatureProfile.elements.action);
          for (const line of unit.lines.filter((l) => !l.isBlank)) {
            for (const m of line.marks ?? []) {
              expect(m.start).toBeGreaterThanOrEqual(0);
              expect(m.end).toBeGreaterThan(m.start);
              expect(m.end).toBeLessThanOrEqual(line.text.length);
            }
          }
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("layoutBlock: line-count invariant (property)", () => {
  it("content-line count matches wrapText, blank-line count matches spaceBefore+spaceAfter", () => {
    fc.assert(
      fc.property(arbitraryBlock, (b) => {
        const style = usFeatureProfile.elements[b.type];
        const unit = layoutBlock(b, style);
        const content = unit.lines.filter((l) => !l.isBlank);
        const blanks = unit.lines.filter((l) => l.isBlank);
        const expectedContentLines = STRUCTURAL_MARKER_TYPES.has(b.type)
          ? 0
          : wrapText(b.text, style.width).length;
        expect(content.length).toBe(expectedContentLines);
        expect(blanks.length).toBe(style.spaceBefore + style.spaceAfter);
      }),
      { numRuns: 2000 },
    );
  });
});
