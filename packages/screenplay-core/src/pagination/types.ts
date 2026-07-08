import type { LayoutLine } from "./layout.js";

export interface Page {
  pageNumber: number;
  lines: LayoutLine[];
}

export interface PageMap {
  pages: Page[];
}
