import type { Block, MarkRange, ScreenplayDocument } from "./model.js";

// Web Crypto's randomUUID is a global in both browsers and Node 19+ — no
// platform-specific import, keeping this package dependency-free (§4).
function newId(): string {
  return globalThis.crypto.randomUUID();
}

function ensureIds(blocks: Block[]): Block[] {
  return blocks.map((block) =>
    block.id && typeof block.id === "string" ? block : { ...block, id: newId() },
  );
}

function ensureUniqueIds(blocks: Block[]): Block[] {
  const seen = new Set<string>();
  return blocks.map((block) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      return block;
    }
    const freshId = newId();
    seen.add(freshId);
    return { ...block, id: freshId };
  });
}

/**
 * Repairs dual-dialogue structure deterministically without deleting any
 * block: a `dual_dialogue` marker not immediately followed by a non-empty
 * "left" run then a non-empty "right" run is retyped to `action`; a
 * `dualColumn`-tagged block outside such a run has that attr stripped.
 * Never throws on malformed input.
 */
function repairDualDialogue(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    if (!block) {
      i++;
      continue;
    }

    if (block.type === "dual_dialogue") {
      let j = i + 1;
      while (j < blocks.length && blocks[j]?.attrs.dualColumn === "left") j++;
      const leftEnd = j;
      while (j < blocks.length && blocks[j]?.attrs.dualColumn === "right") j++;
      const rightEnd = j;

      if (leftEnd > i + 1 && rightEnd > leftEnd) {
        result.push(block, ...blocks.slice(i + 1, rightEnd));
        i = rightEnd;
        continue;
      }

      result.push({ ...block, type: "action" });
      i++;
      continue;
    }

    if (block.attrs.dualColumn) {
      result.push({ ...block, attrs: { ...block.attrs, dualColumn: undefined } });
      i++;
      continue;
    }

    result.push(block);
    i++;
  }

  return result;
}

/** Clamps, drops invalid, sorts, and merges overlapping same-kind marks. */
function normalizeMarks(block: Block): Block {
  const len = block.text.length;
  const clamped: MarkRange[] = [];
  for (const mark of block.marks) {
    const start = Math.max(0, Math.min(mark.start, len));
    const end = Math.max(0, Math.min(mark.end, len));
    if (start < end) {
      clamped.push({ ...mark, start, end });
    }
  }

  const byKind = new Map<string, MarkRange[]>();
  for (const mark of clamped) {
    const list = byKind.get(mark.kind) ?? [];
    list.push(mark);
    byKind.set(mark.kind, list);
  }

  const merged: MarkRange[] = [];
  for (const kind of [...byKind.keys()].sort()) {
    const sorted = [...(byKind.get(kind) ?? [])].sort((a, b) => a.start - b.start);
    for (const mark of sorted) {
      const last = merged.at(-1);
      if (last && last.kind === mark.kind && mark.start <= last.end) {
        last.end = Math.max(last.end, mark.end);
      } else {
        merged.push({ ...mark });
      }
    }
  }

  return { ...block, marks: merged };
}

/**
 * Deterministically repairs a ScreenplayDocument's structural invariants
 * (unique + immutable-where-valid ids, dual-dialogue pairing, sorted
 * non-overlapping marks per kind). Never throws; normalize(normalize(d)) is
 * always equal to normalize(d).
 */
export function normalize(doc: ScreenplayDocument): ScreenplayDocument {
  const withIds = ensureUniqueIds(ensureIds(doc.blocks));
  const dualFixed = repairDualDialogue(withIds);
  const marksFixed = dualFixed.map(normalizeMarks);
  return { blocks: marksFixed };
}
