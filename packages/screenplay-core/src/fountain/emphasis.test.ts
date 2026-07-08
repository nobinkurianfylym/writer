import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MarkRange } from "../model.js";
import { decodeEmphasis, encodeEmphasis } from "./emphasis.js";

describe("encodeEmphasis", () => {
  it("wraps a single italic mark in *...*", () => {
    expect(encodeEmphasis("hello", [{ kind: "italic", start: 0, end: 5 }])).toBe("*hello*");
  });

  it("wraps a single bold mark in **...**", () => {
    expect(encodeEmphasis("hello", [{ kind: "bold", start: 0, end: 5 }])).toBe("**hello**");
  });

  it("wraps a single underline mark in _..._", () => {
    expect(encodeEmphasis("hello", [{ kind: "underline", start: 0, end: 5 }])).toBe("_hello_");
  });

  it("combines identical bold+italic ranges into ***...***", () => {
    const marks: MarkRange[] = [
      { kind: "bold", start: 0, end: 5 },
      { kind: "italic", start: 0, end: 5 },
    ];
    expect(encodeEmphasis("hello", marks)).toBe("***hello***");
  });

  it("nests bold around italic correctly", () => {
    // "bold and italic" is 15 chars; bold spans the whole thing, italic
    // spans "and italic" (chars 5-15).
    const text = "bold and italic";
    const marks: MarkRange[] = [
      { kind: "bold", start: 0, end: 15 },
      { kind: "italic", start: 5, end: 15 },
    ];
    expect(encodeEmphasis(text, marks)).toBe("**bold *and italic***");
  });

  it("handles marks only partially through the text", () => {
    expect(encodeEmphasis("plain bold plain", [{ kind: "bold", start: 6, end: 10 }])).toBe(
      "plain **bold** plain",
    );
  });

  it("drops unsupported mark kinds (strike, revision) silently", () => {
    expect(encodeEmphasis("hello", [{ kind: "strike", start: 0, end: 5 }])).toBe("hello");
    expect(
      encodeEmphasis("hello", [{ kind: "revision", start: 0, end: 5, revisionColor: "blue" }]),
    ).toBe("hello");
  });

  it("returns plain text unchanged with no marks", () => {
    expect(encodeEmphasis("plain text", [])).toBe("plain text");
  });
});

describe("decodeEmphasis", () => {
  it("parses a single italic mark", () => {
    expect(decodeEmphasis("*hello*")).toEqual({ text: "hello", marks: [{ kind: "italic", start: 0, end: 5 }] });
  });

  it("parses a single bold mark", () => {
    expect(decodeEmphasis("**hello**")).toEqual({ text: "hello", marks: [{ kind: "bold", start: 0, end: 5 }] });
  });

  it("parses a single underline mark", () => {
    expect(decodeEmphasis("_hello_")).toEqual({
      text: "hello",
      marks: [{ kind: "underline", start: 0, end: 5 }],
    });
  });

  it("parses combined bold+italic from ***...***", () => {
    const result = decodeEmphasis("***hello***");
    expect(result.text).toBe("hello");
    expect(result.marks).toEqual(
      expect.arrayContaining([
        { kind: "bold", start: 0, end: 5 },
        { kind: "italic", start: 0, end: 5 },
      ]),
    );
    expect(result.marks).toHaveLength(2);
  });

  it("parses nested bold-around-italic", () => {
    const result = decodeEmphasis("**bold *and italic* text**");
    expect(result.text).toBe("bold and italic text");
    expect(result.marks).toEqual(
      expect.arrayContaining([
        { kind: "bold", start: 0, end: 20 },
        { kind: "italic", start: 5, end: 15 },
      ]),
    );
  });

  it("respects backslash escapes", () => {
    expect(decodeEmphasis("3 \\* 4 = 12")).toEqual({ text: "3 * 4 = 12", marks: [] });
  });

  it("treats an unmatched single asterisk as literal text, never dropping it", () => {
    const result = decodeEmphasis("3 * 4 = 12");
    expect(result.text).toBe("3 * 4 = 12");
    expect(result.marks).toEqual([]);
  });

  it("recovers an unclosed bold marker as literal text without dropping characters", () => {
    const result = decodeEmphasis("plain **bold text with no closer");
    expect(result.text).toBe("plain **bold text with no closer");
    expect(result.marks).toEqual([]);
  });

  it("returns plain text unchanged with no emphasis syntax", () => {
    expect(decodeEmphasis("plain text")).toEqual({ text: "plain text", marks: [] });
  });
});

describe("encodeEmphasis / decodeEmphasis: round-trip (property)", () => {
  it("decode(encode(text, marks)) reproduces text and non-overlapping marks", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !/[*_\\]/.test(s)),
        fc.constantFrom<"bold" | "italic" | "underline">("bold", "italic", "underline"),
        fc.nat(),
        fc.nat(),
        (text, kind, a, b) => {
          const len = text.length;
          if (len === 0) return;
          const start = Math.min(a, b) % len;
          const end = (Math.max(a, b) % len) + 1;
          if (start >= end) return;

          const marks: MarkRange[] = [{ kind, start, end }];
          const encoded = encodeEmphasis(text, marks);
          const decoded = decodeEmphasis(encoded);
          expect(decoded.text).toBe(text);
          expect(decoded.marks).toEqual(marks);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
