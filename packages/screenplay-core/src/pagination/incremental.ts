import type { BlockType, ScreenplayDocument } from "../model.js";
import type { FormatProfile, PaginationRules } from "../format-profile.js";
import { synthesizeMoreAndContd } from "./more-contd.js";
import { paginate, paginateWithoutSynthesis } from "./solver.js";
import type { Page, PageMap } from "./types.js";

export interface ChangedRange {
  /**
   * Index, in the NEW document, of the first block that changed (edited,
   * inserted, or where a deletion begins). Every block before this index
   * must be identical — same id, same content — to the document
   * `prevPageMap` was computed from.
   */
  fromBlockIndex: number;
}

const PULL_FORWARD_TYPES: ReadonlySet<BlockType> = new Set(["scene_heading", "character", "parenthetical"]);

/**
 * Backs `index` up past any run of scene_heading/character/parenthetical
 * blocks immediately before it — chunk-building's pull-forward rules mean a
 * block of one of those types can absorb lines from what follows into its
 * own chunk, so a change starting exactly at `index` might actually belong
 * to a chunk that started earlier. Returns null if it can't establish a
 * safe boundary within `maxLookback` steps (caller should fall back to a
 * full paginate — always correct, just not incremental).
 */
function findPullForwardSafeIndex(
  doc: ScreenplayDocument,
  index: number,
  maxLookback: number,
): number | null {
  let candidate = index;
  let steps = 0;
  while (candidate > 0 && steps < maxLookback) {
    const prevBlock = doc.blocks[candidate - 1];
    if (!prevBlock || !PULL_FORWARD_TYPES.has(prevBlock.type)) break;
    candidate--;
    steps++;
  }
  return steps >= maxLookback ? null : candidate;
}

interface ResumeBoundary {
  /** Number of leading pages from prevPageMap that can be reused unchanged. */
  keptPageCount: number;
  /** Index, in `doc.blocks`, to start recomputing from. */
  startBlockIndex: number;
}

/** Smallest block index (per blockIndexById) appearing anywhere on `page`; ignores unresolvable (deleted) lines. */
function minBlockIndexOnPage(page: Page, blockIndexById: ReadonlyMap<string, number>, fallback: number): number {
  let min = fallback;
  for (const line of page.lines) {
    const idx = blockIndexById.get(line.blockId);
    if (idx !== undefined) min = Math.min(min, idx);
  }
  return min;
}

/**
 * Finds the latest point at which incremental recomputation can safely
 * begin. Three independent things can each force the boundary earlier than
 * naively expected, so this iterates to a fixed point (bounded by
 * maxLookback, past which it gives up — null — rather than risk
 * correctness):
 *
 * 1. Pull-forward: a scene_heading/character/parenthetical block can absorb
 *    lines from what follows into its own chunk, so a change starting right
 *    after one of these might belong to a chunk that started earlier.
 * 2. The page immediately before the first affected one — the candidate
 *    "last kept page" — might not actually be closed for a reason
 *    independent of what follows it (an act-break or explicit page_break
 *    triggered by content that's since moved, or simply because the old
 *    document ended there). The only way to trust it as immutable is if
 *    it's provably full (line count === linesPerPage); otherwise, whatever
 *    used to come after it might now fit *on* it.
 * 3. The first affected page might itself mix in some earlier, still-valid
 *    content (if the last kept page closed cleanly right before it).
 */
function computeResumeBoundary(
  doc: ScreenplayDocument,
  prevPageMap: PageMap,
  blockIndexById: ReadonlyMap<string, number>,
  fromBlockIndex: number,
  rules: PaginationRules,
  maxLookback: number,
): ResumeBoundary | null {
  let startBlockIndex = Math.max(0, Math.min(fromBlockIndex, doc.blocks.length));

  for (let iteration = 0; iteration < maxLookback; iteration++) {
    const safe = findPullForwardSafeIndex(doc, startBlockIndex, maxLookback);
    if (safe === null) return null;
    if (safe < startBlockIndex) {
      startBlockIndex = safe;
      continue;
    }

    if (prevPageMap.pages.length === 0) {
      return { keptPageCount: 0, startBlockIndex };
    }

    const foundAffectedPage = prevPageMap.pages.findIndex((page) =>
      page.lines.some((line) => {
        const idx = blockIndexById.get(line.blockId);
        // A block missing from the new document entirely was deleted — that's
        // definitely part of the change, not "nothing found, so unaffected".
        return idx === undefined || idx >= startBlockIndex;
      }),
    );
    // Nothing old provably touches the change (pure append past the end):
    // treat "one past the last page" as the affected boundary so the
    // last-kept-page fullness check below applies uniformly.
    const firstAffectedPage = foundAffectedPage === -1 ? prevPageMap.pages.length : foundAffectedPage;

    if (firstAffectedPage === 0) {
      return { keptPageCount: 0, startBlockIndex: 0 };
    }

    const lastKeptIndex = firstAffectedPage - 1;
    const lastKeptPage = prevPageMap.pages[lastKeptIndex]!;
    if (lastKeptPage.lines.length < rules.linesPerPage) {
      const min = minBlockIndexOnPage(lastKeptPage, blockIndexById, startBlockIndex);
      if (min < startBlockIndex) {
        startBlockIndex = min;
        continue;
      }
      return { keptPageCount: lastKeptIndex, startBlockIndex };
    }

    if (firstAffectedPage < prevPageMap.pages.length) {
      const min = minBlockIndexOnPage(prevPageMap.pages[firstAffectedPage]!, blockIndexById, startBlockIndex);
      if (min < startBlockIndex) {
        startBlockIndex = min;
        continue;
      }
    }

    return { keptPageCount: firstAffectedPage, startBlockIndex };
  }

  return null;
}

function renumberPages(pages: Page[], startingAt: number): Page[] {
  return pages.map((page, i) => ({ ...page, pageNumber: startingAt + i }));
}

/**
 * Incrementally repaginates: reuses every page strictly before the first
 * one affected by the change, and only reruns layout/chunking/filling from
 * there forward. Always produces the exact same result as calling
 * paginate(doc, profile) on the whole document (verified by property test)
 * — this is purely a performance optimization, and falls back to a full
 * paginate() whenever it can't cheaply prove a safe resume point.
 */
export function repaginate(
  doc: ScreenplayDocument,
  profile: FormatProfile,
  prevPageMap: PageMap,
  changedRange: ChangedRange,
  maxLookback = 500,
): PageMap {
  const blockIndexById = new Map(doc.blocks.map((b, i) => [b.id, i] as const));
  const boundary = computeResumeBoundary(
    doc,
    prevPageMap,
    blockIndexById,
    changedRange.fromBlockIndex,
    profile.pagination,
    maxLookback,
  );
  if (!boundary) return paginate(doc, profile);

  const keptPages = prevPageMap.pages.slice(0, boundary.keptPageCount);
  const suffixDoc: ScreenplayDocument = { blocks: doc.blocks.slice(boundary.startBlockIndex) };
  const freshPages = paginateWithoutSynthesis(suffixDoc, profile);
  const synthesized = synthesizeMoreAndContd(doc, { pages: freshPages }, profile).pages;

  return { pages: renumberPages([...keptPages, ...synthesized], 1) };
}
