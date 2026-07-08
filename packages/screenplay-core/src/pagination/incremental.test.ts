import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Block, ScreenplayDocument } from "../model.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { usTvOneHourProfile } from "../profiles/us-tv-onehour.js";
import { arbitraryBlock, arbitraryDocument } from "../testing.js";
import { repaginate } from "./incremental.js";
import { paginate } from "./solver.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

type Edit =
  | { kind: "editText"; index: number; newText: string }
  | { kind: "insert"; index: number; newBlock: Block }
  | { kind: "delete"; index: number };

function applyEdit(doc: ScreenplayDocument, edit: Edit): { newDoc: ScreenplayDocument; fromBlockIndex: number } {
  const blocks = [...doc.blocks];

  if (edit.kind === "editText") {
    const idx = Math.min(edit.index, blocks.length - 1);
    if (idx < 0) return { newDoc: doc, fromBlockIndex: 0 };
    const target = blocks[idx]!;
    blocks[idx] = { ...target, text: edit.newText };
    return { newDoc: { blocks }, fromBlockIndex: idx };
  }

  if (edit.kind === "insert") {
    const idx = Math.min(edit.index, blocks.length);
    blocks.splice(idx, 0, edit.newBlock);
    return { newDoc: { blocks }, fromBlockIndex: idx };
  }

  const idx = Math.min(edit.index, blocks.length - 1);
  if (idx < 0) return { newDoc: doc, fromBlockIndex: 0 };
  blocks.splice(idx, 1);
  return { newDoc: { blocks }, fromBlockIndex: Math.min(idx, blocks.length) };
}

describe("repaginate: full-vs-incremental equivalence (property)", () => {
  it("matches a full paginate() for random single edits (10k trials, both shipped profiles)", () => {
    fc.assert(
      fc.property(
        arbitraryDocument,
        fc.constantFrom(usFeatureProfile, usTvOneHourProfile),
        fc.nat(),
        fc.string({ maxLength: 40 }),
        arbitraryBlock,
        (doc, profile, rawIndex, newText, newBlock) => {
          if (doc.blocks.length === 0) return;

          const prevPageMap = paginate(doc, profile);
          const index = rawIndex % doc.blocks.length;

          for (const kind of ["editText", "insert", "delete"] as const) {
            const edit: Edit =
              kind === "editText"
                ? { kind, index, newText }
                : kind === "insert"
                  ? { kind, index, newBlock }
                  : { kind, index };

            const { newDoc, fromBlockIndex } = applyEdit(doc, edit);
            const incremental = repaginate(newDoc, profile, prevPageMap, { fromBlockIndex });
            const full = paginate(newDoc, profile);
            expect(incremental).toEqual(full);
          }
        },
      ),
      { numRuns: 10_000 },
    );
  });
});

describe("repaginate: examples", () => {
  function bigDoc(n: number): ScreenplayDocument {
    return {
      blocks: Array.from({ length: n }, (_, i) =>
        block({ id: `b${i}`, type: i % 5 === 0 ? "scene_heading" : "action", text: `Content number ${i}.` }),
      ),
    };
  }

  it("reuses pages before the edit and only recomputes from there forward", () => {
    const profile = usFeatureProfile;
    const doc = bigDoc(300);
    const prevPageMap = paginate(doc, profile);
    expect(prevPageMap.pages.length).toBeGreaterThan(2);

    const editIndex = doc.blocks.length - 5;
    const { newDoc, fromBlockIndex } = applyEdit(doc, { kind: "editText", index: editIndex, newText: "Changed!" });
    const incremental = repaginate(newDoc, profile, prevPageMap, { fromBlockIndex });
    const full = paginate(newDoc, profile);

    expect(incremental).toEqual(full);
    // The early pages should be byte-identical objects worth of content —
    // confirm at least the first page matches prevPageMap's untouched.
    expect(incremental.pages[0]).toEqual(prevPageMap.pages[0]);
  });

  it("behaves like a full recompute when the very first block changes", () => {
    const profile = usFeatureProfile;
    const doc = bigDoc(50);
    const prevPageMap = paginate(doc, profile);
    const { newDoc, fromBlockIndex } = applyEdit(doc, { kind: "editText", index: 0, newText: "Changed first." });

    const incremental = repaginate(newDoc, profile, prevPageMap, { fromBlockIndex });
    const full = paginate(newDoc, profile);
    expect(incremental).toEqual(full);
  });

  it("falls back to a full recompute (still correct) when maxLookback is exhausted immediately", () => {
    const profile = usFeatureProfile;
    const doc = bigDoc(50);
    const prevPageMap = paginate(doc, profile);
    const { newDoc, fromBlockIndex } = applyEdit(doc, { kind: "editText", index: 25, newText: "Changed." });

    const incremental = repaginate(newDoc, profile, prevPageMap, { fromBlockIndex }, 0);
    const full = paginate(newDoc, profile);
    expect(incremental).toEqual(full);
  });

  it("correctly recomputes a dialogue split's MORE/CONT'D markers after an edit", () => {
    const smallProfile = JSON.parse(JSON.stringify(usFeatureProfile));
    smallProfile.pagination.linesPerPage = 10;

    const longDialogue = Array.from({ length: 15 }, (_, i) => `Word${i}`.padEnd(34, "x")).join(" ");
    const doc: ScreenplayDocument = {
      blocks: [
        block({ id: "char", type: "character", text: "MAYA" }),
        block({ id: "dia", type: "dialogue", text: longDialogue }),
      ],
    };

    const prevPageMap = paginate(doc, smallProfile);
    expect(prevPageMap.pages.length).toBeGreaterThan(1);

    const { newDoc, fromBlockIndex } = applyEdit(doc, {
      kind: "editText",
      index: 1,
      newText: Array.from({ length: 20 }, (_, i) => `Different${i}`.padEnd(34, "y")).join(" "),
    });

    const incremental = repaginate(newDoc, smallProfile, prevPageMap, { fromBlockIndex });
    const full = paginate(newDoc, smallProfile);
    expect(incremental).toEqual(full);
  });
});
