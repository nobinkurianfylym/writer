import type { BlockType, ScreenplayDocument } from "../model.js";
import type { FormatProfile, PaginationRules } from "../format-profile.js";
import { layoutDocument, type LayoutLine, type LayoutUnit } from "./layout.js";
import { synthesizeMoreAndContd } from "./more-contd.js";
import type { Page, PageMap } from "./types.js";

export type { Page, PageMap } from "./types.js";

/**
 * Block types whose lines can be split across a page boundary (respecting
 * minOrphanLines on both sides): multi-paragraph prose that's naturally
 * allowed to run long. Everything else with content is kept whole — a
 * one/two-line scene heading, character cue, parenthetical, transition,
 * shot, or centered text split mid-element would never happen in a real
 * screenplay.
 */
const SPLITTABLE_TYPES: ReadonlySet<BlockType> = new Set(["action", "dialogue", "lyric"]);

/** A single keep-together unit the page filler treats as one decision. */
type Chunk =
  | { kind: "atomic"; blockType: BlockType; lines: LayoutLine[] }
  | { kind: "splittable"; blockType: BlockType; lines: LayoutLine[] };

/**
 * `page_break` blocks carry zero layout lines by design (no visual
 * footprint) — layoutDocument's flattened output would otherwise lose them
 * entirely, making the "explicit page_break blocks" rule undetectable. This
 * injects a single zero-content sentinel per zero-line page_break unit so
 * buildChunks can still see it; fillPages' page_break handling always takes
 * the signal-only path and never adds these lines to a page.
 */
function flattenForSolver(units: LayoutUnit[]): LayoutLine[] {
  return units.flatMap((unit) => {
    if (unit.lines.length === 0 && unit.blockType === "page_break") {
      return [
        {
          blockId: unit.blockId,
          blockType: unit.blockType,
          lineIndexInBlock: -1,
          totalLinesInBlock: 0,
          text: "",
          isBlank: true,
        },
      ];
    }
    return unit.lines;
  });
}

/**
 * Groups the flat line sequence into keep-together chunks:
 * - a scene_heading pulls forward `sceneHeadingMinLinesBeforeBreak` lines of
 *   whatever follows, so it's never left starved of content on its page
 *   ("no orphaned scene headings").
 * - a character or parenthetical cue pulls forward 1 line, so it's never
 *   the last thing on a page ("parenthetical never separated from first
 *   dialogue line", generalized to character cues for the same reason).
 * - action/dialogue/lyric become splittable chunks (see SPLITTABLE_TYPES).
 * - everything else (transition, shot, centered, note, section, synopsis,
 *   and the zero-line structural markers dual_dialogue/page_break/
 *   title_page) is one atomic chunk of its own lines.
 */
function buildChunks(lines: LayoutLine[], rules: PaginationRules): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }

    if (line.blockType === "scene_heading" || line.blockType === "character" || line.blockType === "parenthetical") {
      const blockType = line.blockType;
      let j = i;
      while (j < lines.length && lines[j]?.blockId === line.blockId) j++;

      const pullForwardTarget = blockType === "scene_heading" ? rules.sceneHeadingMinLinesBeforeBreak : 1;
      let pulled = 0;
      let k = j;
      while (pulled < pullForwardTarget && k < lines.length) {
        // An intentional page_break right after: don't fight it by pulling
        // lines across it just to satisfy the orphan-control minimum.
        if (lines[k]?.blockType === "page_break") break;
        k++;
        pulled++;
      }
      chunks.push({ kind: "atomic", blockType, lines: lines.slice(i, k) });
      i = k;
      continue;
    }

    if (SPLITTABLE_TYPES.has(line.blockType)) {
      const blockType = line.blockType;
      let j = i;
      while (j < lines.length && lines[j]?.blockId === line.blockId) j++;
      chunks.push({ kind: "splittable", blockType, lines: lines.slice(i, j) });
      i = j;
      continue;
    }

    const blockType = line.blockType;
    let j = i;
    while (j < lines.length && lines[j]?.blockId === line.blockId) j++;
    chunks.push({ kind: "atomic", blockType, lines: lines.slice(i, j) });
    i = j;
  }

  return chunks;
}

/**
 * Largest split point in [1, maxFit] leaving at least minOrphanLines of the
 * original block on both sides, measured against each line's own
 * lineIndexInBlock/totalLinesInBlock (so this is correct even when
 * `remaining` is itself the tail-end of a block already partly placed on a
 * previous page). Returns 0 if no valid split exists within maxFit.
 */
function findValidSplit(remaining: LayoutLine[], maxFit: number, minOrphanLines: number): number {
  const limit = Math.min(maxFit, remaining.length);
  for (let splitAt = limit; splitAt >= 1; splitAt--) {
    const lastIncluded = remaining[splitAt - 1];
    if (!lastIncluded) continue;
    if (lastIncluded.lineIndexInBlock + 1 < minOrphanLines) continue;

    const firstExcluded = remaining[splitAt];
    if (firstExcluded) {
      const linesAfter = firstExcluded.totalLinesInBlock - firstExcluded.lineIndexInBlock;
      if (linesAfter < minOrphanLines) continue;
    }
    return splitAt;
  }
  return 0;
}

function fillPages(chunks: Chunk[], rules: PaginationRules): Page[] {
  const pages: Page[] = [];
  let current: LayoutLine[] = [];

  function closePage() {
    if (current.length > 0) {
      pages.push({ pageNumber: pages.length + 1, lines: current });
      current = [];
    }
  }

  for (const chunk of chunks) {
    if (chunk.blockType === "page_break") {
      closePage();
      continue; // page_break itself carries zero layout lines
    }
    if (rules.honorsActBreaks && chunk.blockType === "section" && current.length > 0) {
      closePage();
    }

    if (current.length + chunk.lines.length <= rules.linesPerPage) {
      current.push(...chunk.lines);
      continue;
    }

    if (chunk.kind === "atomic") {
      if (current.length > 0) closePage();
      current.push(...chunk.lines);
      if (chunk.lines.length >= rules.linesPerPage) closePage();
      continue;
    }

    // A dialogue split gets (MORE)/(CONT'D) markers (checklist item 4) — the
    // actual marker lines are inserted by a later pass, but the space for
    // them must be reserved here, in the split decision itself: 1 line at
    // the bottom of a page a dialogue chunk continues past, 1 line at the
    // top of a page it continues onto. action/lyric splits get neither.
    const isDialogue = chunk.blockType === "dialogue";
    let remaining = chunk.lines;
    let isContinuation = false;

    while (remaining.length > 0) {
      const contdReserve = isDialogue && isContinuation ? 1 : 0;
      const spaceLeft = rules.linesPerPage - current.length - contdReserve;
      if (spaceLeft <= 0) {
        closePage();
        continue;
      }
      if (remaining.length <= spaceLeft) {
        current.push(...remaining);
        remaining = [];
        break;
      }

      const moreReserve = isDialogue ? 1 : 0;
      const splitAt = findValidSplit(remaining, spaceLeft - moreReserve, rules.minOrphanLines);
      if (splitAt <= 0) {
        closePage();
        continue;
      }
      current.push(...remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
      closePage();
      isContinuation = true;
    }
  }

  closePage();
  return pages;
}

/**
 * The full-paginate entrypoint (E1-5): lays out every block against the
 * format profile, decides page-break points honoring the keep-together
 * rules above (reserving space for a dialogue split's (MORE)/(CONT'D)
 * markers as part of that decision), then inserts the marker lines
 * themselves. Deterministic — the same document and profile always produce
 * a byte-identical PageMap. Incremental repagination is the next checklist
 * item, layered on top of this.
 */
export function paginate(doc: ScreenplayDocument, profile: FormatProfile): PageMap {
  const flat = flattenForSolver(layoutDocument(doc, profile));
  const chunks = buildChunks(flat, profile.pagination);
  const pageMap: PageMap = { pages: fillPages(chunks, profile.pagination) };
  return synthesizeMoreAndContd(doc, pageMap, profile);
}
