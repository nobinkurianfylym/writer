import type { Block, MarkRange, ScreenplayDocument } from "./model.js";

function validateMarks(block: Block, violations: string[]): void {
  const byKind = new Map<string, MarkRange[]>();
  for (const mark of block.marks) {
    if (mark.start < 0 || mark.end > block.text.length || mark.start >= mark.end) {
      violations.push(`block ${block.id}: mark ${mark.kind} [${mark.start},${mark.end}) is out of bounds or empty`);
      continue;
    }
    const list = byKind.get(mark.kind) ?? [];
    list.push(mark);
    byKind.set(mark.kind, list);
  }

  for (const [kind, ranges] of byKind) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i] !== sorted[i]) {
        violations.push(`block ${block.id}: ${kind} marks are not sorted by start`);
        break;
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev && cur && cur.start < prev.end) {
        violations.push(`block ${block.id}: overlapping ${kind} marks [${prev.start},${prev.end}) and [${cur.start},${cur.end})`);
      }
    }
  }
}

function validateDualDialogue(blocks: Block[], violations: string[]): void {
  let i = 0;
  const consumedAsGroupMember = new Set<number>();

  while (i < blocks.length) {
    const block = blocks[i];
    if (block?.type === "dual_dialogue") {
      let j = i + 1;
      let leftCount = 0;
      while (j < blocks.length && blocks[j]?.attrs.dualColumn === "left") {
        leftCount++;
        j++;
      }
      let rightCount = 0;
      while (j < blocks.length && blocks[j]?.attrs.dualColumn === "right") {
        rightCount++;
        j++;
      }
      if (leftCount === 0 || rightCount === 0) {
        violations.push(`block ${block.id}: dual_dialogue marker without a paired left+right column group`);
      } else {
        for (let k = i + 1; k < j; k++) consumedAsGroupMember.add(k);
      }
    }
    i++;
  }

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block?.attrs.dualColumn && !consumedAsGroupMember.has(idx)) {
      violations.push(`block ${block.id}: dualColumn="${block.attrs.dualColumn}" outside of a dual_dialogue group`);
    }
  }
}

function validateIds(blocks: Block[], violations: string[]): void {
  const seen = new Set<string>();
  for (const block of blocks) {
    if (!block.id || typeof block.id !== "string") {
      violations.push(`block missing a valid id`);
      continue;
    }
    if (seen.has(block.id)) {
      violations.push(`duplicate block id: ${block.id}`);
    }
    seen.add(block.id);
  }
}

/** Returns a list of structural-invariant violations; empty means valid. */
export function validate(doc: ScreenplayDocument): string[] {
  const violations: string[] = [];
  validateIds(doc.blocks, violations);
  validateDualDialogue(doc.blocks, violations);
  for (const block of doc.blocks) {
    validateMarks(block, violations);
  }
  return violations;
}

export function isValid(doc: ScreenplayDocument): boolean {
  return validate(doc).length === 0;
}
