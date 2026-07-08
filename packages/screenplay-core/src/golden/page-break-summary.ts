import type { PageMap } from "../pagination/solver.js";

export interface PageBreakSummary {
  pageNumber: number;
  lineCount: number;
  firstContentBlockId: string | null;
  lastContentBlockId: string | null;
}

/** Which block starts/ends each page, plus its line count — enough to catch drift in the pagination algorithm without being so granular it's fragile to harmless internal changes. */
export function summarizePageMap(pageMap: PageMap): PageBreakSummary[] {
  return pageMap.pages.map((page) => {
    const contentLines = page.lines.filter((l) => !l.isBlank);
    return {
      pageNumber: page.pageNumber,
      lineCount: page.lines.length,
      firstContentBlockId: contentLines[0]?.blockId ?? null,
      lastContentBlockId: contentLines.at(-1)?.blockId ?? null,
    };
  });
}
