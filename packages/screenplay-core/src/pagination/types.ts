import type { LayoutLine } from "./layout.js";

/** One physical page's worth of laid-out content, as produced by `paginate()`/`repaginate()`. */
export interface Page {
  /** 1-based page number. */
  pageNumber: number;
  /** Every line on this page, blank spacer lines included, top to bottom. */
  lines: LayoutLine[];
}

/** The full paginated result of a screenplay document: every page, in order. */
export interface PageMap {
  /** Every page, in page-number order. */
  pages: Page[];
}
