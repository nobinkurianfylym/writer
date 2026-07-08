import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHARS_PER_INCH, lineCount, maxCharsForWidth, wrapText, wrapTextWithOffsets } from "./line-metrics.js";

describe("maxCharsForWidth", () => {
  it("converts inches to characters at 10 chars/inch", () => {
    expect(maxCharsForWidth(6.0)).toBe(60);
    expect(maxCharsForWidth(3.5)).toBe(35);
  });

  it("never returns less than 1, even for a near-zero width", () => {
    expect(maxCharsForWidth(0)).toBe(1);
    expect(maxCharsForWidth(0.01)).toBe(1);
  });
});

describe("wrapText: basic wrapping", () => {
  it("fits short text on one line", () => {
    expect(wrapText("INT. HOUSE - DAY", 6.0)).toEqual(["INT. HOUSE - DAY"]);
  });

  it("wraps at word boundaries once the line exceeds the width", () => {
    const text = "Maya walks slowly across the room toward the window, watching the rain.";
    const lines = wrapText(text, 3.5); // 35 chars/line
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(35);
    }
    // No word is split across a wrap boundary under normal (non-overlong) wrapping.
    expect(lines.join(" ")).toBe(text);
  });

  it("returns a single empty line for empty text", () => {
    expect(wrapText("", 6.0)).toEqual([""]);
  });

  it("does not wrap when the text exactly fills the width", () => {
    const text = "A".repeat(35);
    expect(wrapText(text, 3.5)).toEqual([text]);
  });

  it("wraps as soon as text exceeds the width by one character", () => {
    const text = `${"A".repeat(34)} B`;
    const lines = wrapText(text, 3.5);
    expect(lines).toEqual(["A".repeat(34), "B"]);
  });
});

describe("wrapText: hard breaks and overlong words", () => {
  it("preserves author-inserted \\n hard breaks as separate lines", () => {
    const lines = wrapText("Roses are red\nViolets are blue", 6.0);
    expect(lines).toEqual(["Roses are red", "Violets are blue"]);
  });

  it("hard-breaks a single word longer than the element width, never dropping characters", () => {
    const longWord = "Supercalifragilisticexpialidocious"; // 34 chars
    const lines = wrapText(longWord, 1.0); // 10 chars/line
    expect(lines.join("")).toBe(longWord);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
  });

  it("normalizes runs of whitespace within a line (typesetting, not data mutation)", () => {
    expect(wrapText("hello    world", 6.0)).toEqual(["hello world"]);
  });
});

describe("lineCount", () => {
  it("matches wrapText(...).length", () => {
    expect(lineCount("INT. HOUSE - DAY", 6.0)).toBe(1);
    expect(lineCount("", 6.0)).toBe(1);
  });
});

describe("wrapText: never throws, never drops a character (property)", () => {
  it("preserves all non-whitespace characters, in order, for arbitrary text and widths", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (text, width) => {
          let lines: string[] = [];
          expect(() => {
            lines = wrapText(text, width);
          }).not.toThrow();
          expect(lines.length).toBeGreaterThan(0);

          // Whitespace is where wrapping (soft breaks) and normalization
          // legitimately change the text; every non-whitespace character
          // must still appear, in the same order, regardless of where the
          // wrapper chose to break lines (including mid-word hard breaks).
          const originalContent = text.replace(/\s+/g, "");
          const rebuiltContent = lines.join("").replace(/\s+/g, "");
          expect(rebuiltContent).toBe(originalContent);
        },
      ),
      { numRuns: 5000 },
    );
  });

  it("is deterministic: identical input always produces identical output", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (text, width) => {
          expect(wrapText(text, width)).toEqual(wrapText(text, width));
        },
      ),
      { numRuns: 5000 },
    );
  });
});

describe("wrapText: CHARS_PER_INCH constant", () => {
  it("is the published 12pt Courier pitch", () => {
    expect(CHARS_PER_INCH).toBe(10);
  });
});

describe("wrapTextWithOffsets: offset invariant (property)", () => {
  it("is text-equivalent to wrapText and each line's offsets slice the matching content out of the original text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (text, width) => {
          const withOffsets = wrapTextWithOffsets(text, width);
          expect(withOffsets.map((l) => l.text)).toEqual(wrapText(text, width));

          for (const line of withOffsets) {
            expect(line.start).toBeGreaterThanOrEqual(0);
            expect(line.end).toBeGreaterThanOrEqual(line.start);
            expect(line.end).toBeLessThanOrEqual(text.length);
            // The slice may still carry the *original* (unnormalized) inter-word
            // whitespace the wrapped line collapsed to single spaces.
            const slice = text.slice(line.start, line.end).replace(/\s+/g, " ");
            expect(slice).toBe(line.text);
          }
        },
      ),
      { numRuns: 5000 },
    );
  });

  it("slices out each wrapped line's exact text for a known multi-line example", () => {
    const text = "Maya walks slowly across the room toward the window.";
    const lines = wrapTextWithOffsets(text, 2.0); // 20 chars/line
    for (const line of lines) {
      expect(text.slice(line.start, line.end)).toBe(line.text);
    }
  });
});
