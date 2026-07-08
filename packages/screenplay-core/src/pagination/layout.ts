import type { Block, BlockType, MarkRange, ScreenplayDocument } from "../model.js";
import type { ElementStyle, FormatProfile } from "../format-profile.js";
import { wrapTextWithOffsets } from "./line-metrics.js";

/**
 * Block types with no flowing text content of their own in the body page
 * layout: `dual_dialogue` is a pure grouping marker (the actual character/
 * dialogue blocks in its left/right columns carry the real content),
 * `page_break` is a pure signal consumed by the keep-together solver
 * (checklist item 3), and `title_page` is rendered by its own dedicated
 * layout (E1-8/E2-6), not the body flow. All three still take whatever
 * spaceBefore/spaceAfter their ElementStyle specifies.
 */
export const STRUCTURAL_MARKER_TYPES: ReadonlySet<BlockType> = new Set([
  "dual_dialogue",
  "page_break",
  "title_page",
]);

/** One physical row of the page grid: either a wrapped content line or a blank spacer, tagged with which block it came from. */
export interface LayoutLine {
  /** id of the `Block` this line belongs to. */
  blockId: string;
  /** type of the `Block` this line belongs to. */
  blockType: BlockType;
  /** 0-based index into this block's own wrapped content lines; -1 for a spacer line. */
  lineIndexInBlock: number;
  /** Total content lines (excluding spacers) this block wraps to. */
  totalLinesInBlock: number;
  /** This line's wrapped text; empty for a spacer line. */
  text: string;
  /** True for a spaceBefore/spaceAfter spacer line with no content of its own. */
  isBlank: boolean;
  /** True only for a (MORE)/(CONT'D) marker line inserted by the pagination
   * solver's MORE/CONT'D synthesis pass — never set by layoutBlock itself. */
  synthetic?: true;
  /**
   * This line's slice of the block's marks, rebased to offsets within `text`
   * (not the original block.text) — what the PDF typesetter (E1-8) draws.
   * Omitted (rather than `[]`) when empty, so it never appears in this
   * package's own toEqual fixtures written before marks existed.
   */
  marks?: MarkRange[];
}

/** A single Block's own laid-out lines (spaceBefore blanks + wrapped content + spaceAfter blanks), before the pagination solver groups units across page boundaries. */
export interface LayoutUnit {
  /** id of the source `Block`. */
  blockId: string;
  /** type of the source `Block`. */
  blockType: BlockType;
  /** This block's spacer + content lines, in top-to-bottom order. */
  lines: LayoutLine[];
}

function blankLine(block: Block, totalLinesInBlock: number): LayoutLine {
  return {
    blockId: block.id,
    blockType: block.type,
    lineIndexInBlock: -1,
    totalLinesInBlock,
    text: "",
    isBlank: true,
  };
}

/** Clips `marks` to the [start, end) window and rebases each surviving range to be relative to that window, dropping ranges that don't intersect it at all. */
function marksForWindow(marks: MarkRange[], start: number, end: number): MarkRange[] | undefined {
  const clipped: MarkRange[] = [];
  for (const m of marks) {
    const clippedStart = Math.max(m.start, start);
    const clippedEnd = Math.min(m.end, end);
    if (clippedStart < clippedEnd) {
      clipped.push({ ...m, start: clippedStart - start, end: clippedEnd - start });
    }
  }
  return clipped.length > 0 ? clipped : undefined;
}

/** Lays out a single block: spaceBefore blanks + wrapped content + spaceAfter blanks. */
export function layoutBlock(block: Block, style: ElementStyle): LayoutUnit {
  const wrapped = STRUCTURAL_MARKER_TYPES.has(block.type) ? [] : wrapTextWithOffsets(block.text, style.width);

  const lines: LayoutLine[] = [];
  for (let i = 0; i < style.spaceBefore; i++) lines.push(blankLine(block, wrapped.length));
  wrapped.forEach(({ text, start, end }, lineIndexInBlock) => {
    const lineMarks = block.marks.length > 0 ? marksForWindow(block.marks, start, end) : undefined;
    lines.push({
      blockId: block.id,
      blockType: block.type,
      lineIndexInBlock,
      totalLinesInBlock: wrapped.length,
      text,
      isBlank: false,
      ...(lineMarks ? { marks: lineMarks } : {}),
    });
  });
  for (let i = 0; i < style.spaceAfter; i++) lines.push(blankLine(block, wrapped.length));

  return { blockId: block.id, blockType: block.type, lines };
}

/** Lays out every block in a document against its format profile, in order. */
export function layoutDocument(doc: ScreenplayDocument, profile: FormatProfile): LayoutUnit[] {
  return doc.blocks.map((block) => layoutBlock(block, profile.elements[block.type]));
}
