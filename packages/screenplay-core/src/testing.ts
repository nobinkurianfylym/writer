import fc from "fast-check";
import { BLOCK_TYPES, MARK_KINDS, type Block, type MarkRange, type ScreenplayDocument } from "./model.js";

const ORDINARY_BLOCK_TYPES = BLOCK_TYPES.filter((type) => type !== "dual_dialogue");
const COLUMN_BLOCK_TYPES = ["character", "dialogue", "parenthetical"] as const;

export const arbitraryBlockType = fc.constantFrom(...ORDINARY_BLOCK_TYPES);

export const arbitraryMarkKind = fc.constantFrom(...MARK_KINDS);

/** A mark range guaranteed valid (in-bounds, non-empty) for a given text length. Requires len > 0. */
export function arbitraryMarkRangeForLength(len: number): fc.Arbitrary<MarkRange> {
  return fc
    .tuple(fc.nat({ max: len - 1 }), fc.nat({ max: len - 1 }), arbitraryMarkKind)
    .map(([a, b, kind]) => ({ kind, start: Math.min(a, b), end: Math.max(a, b) + 1 }));
}

function arbitraryOrdinaryBlock(type?: (typeof BLOCK_TYPES)[number]): fc.Arbitrary<Block> {
  return fc
    .tuple(
      fc.uuid(),
      type ? fc.constant(type) : arbitraryBlockType,
      fc.string({ maxLength: 40 }),
    )
    .chain(([id, blockType, text]) =>
      (text.length === 0
        ? fc.constant<MarkRange[]>([])
        : fc.array(arbitraryMarkRangeForLength(text.length), { maxLength: 3 })
      ).map((marks) => ({ id, type: blockType, text, marks, attrs: {} }) satisfies Block),
    );
}

/** One syntactically-valid, non-dual-dialogue block. */
export const arbitraryBlock: fc.Arbitrary<Block> = arbitraryOrdinaryBlock();

function arbitraryColumnBlock(column: "left" | "right"): fc.Arbitrary<Block> {
  return fc
    .tuple(fc.uuid(), fc.constantFrom(...COLUMN_BLOCK_TYPES), fc.string({ maxLength: 40 }))
    .map(([id, type, text]) => ({ id, type, text, marks: [], attrs: { dualColumn: column } }));
}

/** A well-formed [marker, ...left, ...right] dual-dialogue group. */
export const arbitraryDualDialogueGroup: fc.Arbitrary<Block[]> = fc
  .tuple(
    fc.uuid(),
    fc.array(arbitraryColumnBlock("left"), { minLength: 1, maxLength: 2 }),
    fc.array(arbitraryColumnBlock("right"), { minLength: 1, maxLength: 2 }),
  )
  .map(([markerId, left, right]) => [
    { id: markerId, type: "dual_dialogue", text: "", marks: [], attrs: {} } satisfies Block,
    ...left,
    ...right,
  ]);

function dedupeIds(blocks: Block[]): Block[] {
  const seen = new Set<string>();
  return blocks.map((block, i) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      return block;
    }
    const freshId = `${block.id}-dedup-${i}`;
    seen.add(freshId);
    return { ...block, id: freshId };
  });
}

/** A structurally-valid ScreenplayDocument: validate(doc) is always []. */
export const arbitraryDocument: fc.Arbitrary<ScreenplayDocument> = fc
  .array(fc.oneof(arbitraryBlock.map((b) => [b]), arbitraryDualDialogueGroup), { maxLength: 12 })
  .map((groups) => ({ blocks: dedupeIds(groups.flat()) }));

type Corruption = (blocks: Block[]) => Block[];

const dropMarker: Corruption = (blocks) => {
  const idx = blocks.findIndex((b) => b.type === "dual_dialogue");
  if (idx === -1) return blocks;
  return blocks.filter((_, i) => i !== idx);
};

const orphanColumnBlock: Corruption = (blocks) => {
  const idx = blocks.findIndex((b) => b.attrs.dualColumn);
  if (idx === -1) return blocks;
  const target = blocks[idx];
  if (!target) return blocks;
  return [{ ...target, attrs: { ...target.attrs, dualColumn: "left" } }, ...blocks];
};

const duplicateAnId: Corruption = (blocks) => {
  if (blocks.length < 2) return blocks;
  const [first, ...rest] = blocks;
  if (!first) return blocks;
  return [first, { ...first, text: `${first.text}-dup` }, ...rest.slice(1)];
};

const overlapMarks: Corruption = (blocks) => {
  const idx = blocks.findIndex((b) => b.text.length >= 2);
  if (idx === -1) return blocks;
  const target = blocks[idx];
  if (!target) return blocks;
  const len = target.text.length;
  const overlapping: MarkRange[] = [
    { kind: "bold", start: 0, end: Math.max(1, Math.floor(len / 2) + 1) },
    { kind: "bold", start: Math.max(0, Math.floor(len / 2) - 1), end: len },
  ];
  const patched = [...blocks];
  patched[idx] = { ...target, marks: [...target.marks, ...overlapping] };
  return patched;
};

const outOfBoundsMark: Corruption = (blocks) => {
  const idx = blocks.findIndex((b) => b.text.length > 0);
  if (idx === -1) return blocks;
  const target = blocks[idx];
  if (!target) return blocks;
  const patched = [...blocks];
  patched[idx] = {
    ...target,
    marks: [...target.marks, { kind: "italic", start: -5, end: target.text.length + 50 }],
  };
  return patched;
};

const CORRUPTIONS: Corruption[] = [
  dropMarker,
  orphanColumnBlock,
  duplicateAnId,
  overlapMarks,
  outOfBoundsMark,
];

/**
 * A ScreenplayDocument deliberately violating one or more structural
 * invariants (unpaired dual dialogue, duplicate ids, overlapping/out-of-bounds
 * marks) — used to assert normalize() repairs rather than throws.
 */
export const arbitraryDocumentWithViolations: fc.Arbitrary<ScreenplayDocument> = fc
  .tuple(arbitraryDocument, fc.subarray(CORRUPTIONS, { minLength: 1 }))
  .map(([doc, corruptions]) => ({
    blocks: corruptions.reduce((blocks, corrupt) => corrupt(blocks), doc.blocks),
  }));
