import type { Block, BlockType, ScreenplayDocument } from "../model.js";
import type { ElementStyle, FormatProfile } from "../format-profile.js";
import { wrapText } from "./line-metrics.js";

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

export interface LayoutLine {
  blockId: string;
  blockType: BlockType;
  /** 0-based index into this block's own wrapped content lines; -1 for a spacer line. */
  lineIndexInBlock: number;
  /** Total content lines (excluding spacers) this block wraps to. */
  totalLinesInBlock: number;
  text: string;
  isBlank: boolean;
}

export interface LayoutUnit {
  blockId: string;
  blockType: BlockType;
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

/** Lays out a single block: spaceBefore blanks + wrapped content + spaceAfter blanks. */
export function layoutBlock(block: Block, style: ElementStyle): LayoutUnit {
  const wrapped = STRUCTURAL_MARKER_TYPES.has(block.type) ? [] : wrapText(block.text, style.width);

  const lines: LayoutLine[] = [];
  for (let i = 0; i < style.spaceBefore; i++) lines.push(blankLine(block, wrapped.length));
  wrapped.forEach((text, lineIndexInBlock) => {
    lines.push({
      blockId: block.id,
      blockType: block.type,
      lineIndexInBlock,
      totalLinesInBlock: wrapped.length,
      text,
      isBlank: false,
    });
  });
  for (let i = 0; i < style.spaceAfter; i++) lines.push(blankLine(block, wrapped.length));

  return { blockId: block.id, blockType: block.type, lines };
}

/** Lays out every block in a document against its format profile, in order. */
export function layoutDocument(doc: ScreenplayDocument, profile: FormatProfile): LayoutUnit[] {
  return doc.blocks.map((block) => layoutBlock(block, profile.elements[block.type]));
}
