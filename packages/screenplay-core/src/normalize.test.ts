import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, ScreenplayDocument } from "./model.js";
import { normalize } from "./normalize.js";
import { isValid, validate } from "./validate.js";
import { arbitraryDocument, arbitraryDocumentWithViolations } from "./testing.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

describe("normalize: idempotency (property)", () => {
  it("normalize(normalize(d)) === normalize(d) for valid documents", () => {
    fc.assert(
      fc.property(arbitraryDocument, (doc) => {
        const once = normalize(doc);
        const twice = normalize(once);
        expect(twice).toEqual(once);
      }),
      { numRuns: 10_000 },
    );
  });

  it("normalize(normalize(d)) === normalize(d) for documents with deliberate violations", () => {
    fc.assert(
      fc.property(arbitraryDocumentWithViolations, (doc) => {
        const once = normalize(doc);
        const twice = normalize(once);
        expect(twice).toEqual(once);
      }),
      { numRuns: 10_000 },
    );
  });
});

describe("normalize: repairs illegal structures without throwing (property)", () => {
  it("never throws and always produces a structurally valid document", () => {
    fc.assert(
      fc.property(arbitraryDocumentWithViolations, (doc) => {
        let result: ScreenplayDocument | undefined;
        expect(() => {
          result = normalize(doc);
        }).not.toThrow();
        expect(isValid(result as ScreenplayDocument)).toBe(true);
      }),
      { numRuns: 10_000 },
    );
  });
});

describe("normalize: ID immutability (property)", () => {
  it("never changes an existing valid id on an already-valid document", () => {
    fc.assert(
      fc.property(arbitraryDocument, (doc) => {
        const before = doc.blocks.map((b) => b.id);
        const after = normalize(doc).blocks.map((b) => b.id);
        expect(after).toEqual(before);
      }),
      { numRuns: 10_000 },
    );
  });
});

describe("normalize: dual-dialogue repair (examples)", () => {
  it("retypes a marker with no left/right run to action", () => {
    const doc: ScreenplayDocument = { blocks: [block({ id: "m1", type: "dual_dialogue" })] };
    const result = normalize(doc);
    expect(result.blocks).toEqual([block({ id: "m1", type: "action" })]);
    expect(validate(result)).toEqual([]);
  });

  it("retypes a marker with only a left run, and strips the orphaned left blocks", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "m1", type: "dual_dialogue" }),
        block({ id: "l1", type: "character", text: "MAYA", attrs: { dualColumn: "left" } }),
      ],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.type).toBe("action");
    expect(result.blocks[1]?.attrs.dualColumn).toBeUndefined();
    expect(validate(result)).toEqual([]);
  });

  it("keeps a well-formed marker + left + right group untouched", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "m1", type: "dual_dialogue" }),
        block({ id: "l1", type: "character", text: "MAYA", attrs: { dualColumn: "left" } }),
        block({ id: "r1", type: "character", text: "SAM", attrs: { dualColumn: "right" } }),
      ],
    };
    const result = normalize(doc);
    expect(result).toEqual(doc);
  });

  it("strips a dualColumn tag with no preceding marker at all", () => {
    const doc: ScreenplayDocument = {
      blocks: [block({ id: "l1", type: "character", text: "MAYA", attrs: { dualColumn: "left" } })],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.attrs.dualColumn).toBeUndefined();
  });
});

describe("normalize: marks repair (examples)", () => {
  it("merges overlapping same-kind marks", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({
          text: "hello world",
          marks: [
            { kind: "bold", start: 0, end: 7 },
            { kind: "bold", start: 5, end: 11 },
          ],
        }),
      ],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.marks).toEqual([{ kind: "bold", start: 0, end: 11 }]);
  });

  it("clamps out-of-bounds marks and drops empty ones", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({
          text: "hello",
          marks: [
            { kind: "italic", start: -5, end: 3 },
            { kind: "underline", start: 10, end: 20 },
          ],
        }),
      ],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.marks).toEqual([{ kind: "italic", start: 0, end: 3 }]);
  });

  it("keeps distinct non-overlapping same-kind marks separate", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block({
          text: "hello world",
          marks: [
            { kind: "bold", start: 0, end: 5 },
            { kind: "bold", start: 6, end: 11 },
          ],
        }),
      ],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.marks).toEqual([
      { kind: "bold", start: 0, end: 5 },
      { kind: "bold", start: 6, end: 11 },
    ]);
  });
});

describe("normalize: id repair (examples)", () => {
  it("assigns a fresh id to a block missing one", () => {
    const doc: ScreenplayDocument = { blocks: [block({ id: "" })] };
    const result = normalize(doc);
    expect(result.blocks[0]?.id).toBeTruthy();
  });

  it("reassigns the id of a later duplicate, keeping the first occurrence", () => {
    const doc: ScreenplayDocument = {
      blocks: [block({ id: "dup" }), block({ id: "dup", text: "second" })],
    };
    const result = normalize(doc);
    expect(result.blocks[0]?.id).toBe("dup");
    expect(result.blocks[1]?.id).not.toBe("dup");
  });
});
