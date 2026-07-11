import { degrees, PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { Block, FormatProfile, LayoutLine, Page, PageMap, ScreenplayDocument } from "@fylym/screenplay-core";
import { resolveRevisionColor } from "./color.js";
import {
  embedCourierFonts,
  fontForKinds,
  measureText,
  drawText as drawFallbackText,
  type CourierFonts,
} from "./fonts.js";
import { splitIntoRuns } from "./runs.js";
import { addTitlePage } from "./title-page.js";

const POINTS_PER_INCH = 72;
const FONT_SIZE = 12;
/** 6 lines/inch at 12pt Courier (§ screenplay-core's LINES_PER_INCH — duplicated as a literal since it's not part of that package's public API). */
const POINTS_PER_LINE = POINTS_PER_INCH / 6;
/** Baseline sits this far below a line's top edge — visually centers 12pt Courier within its 12pt row. */
const BASELINE_OFFSET = FONT_SIZE * 0.8;
const BLACK = rgb(0, 0, 0);

export interface TypesetOptions {
  /** Stamped diagonally across every page (including the title page) when set. */
  watermark?: string;
  /** Render each scene heading's attrs.sceneNumber in both margins. Default false. */
  sceneNumbers?: boolean;
}

function lineY(profile: FormatProfile, rowIndex: number): number {
  const heightPts = profile.page.height * POINTS_PER_INCH;
  const topMarginPts = profile.page.margins.top * POINTS_PER_INCH;
  return heightPts - topMarginPts - rowIndex * POINTS_PER_LINE - BASELINE_OFFSET;
}

function drawContentLine(page: PDFPage, line: LayoutLine, rowIndex: number, profile: FormatProfile, fonts: CourierFonts): void {
  if (line.isBlank || line.text.length === 0) return;

  const style = profile.elements[line.blockType];
  const y = lineY(profile, rowIndex);
  const areaXPts = style.indent * POINTS_PER_INCH;
  const areaWidthPts = style.width * POINTS_PER_INCH;

  const runs = splitIntoRuns(line.text, line.marks ?? []);
  const totalWidth = runs.reduce(
    (sum, r) => sum + measureText(r.text, FONT_SIZE, fontForKinds(fonts, r.kinds), fonts.fallback),
    0,
  );

  let x = areaXPts;
  if (style.align === "center") x = areaXPts + (areaWidthPts - totalWidth) / 2;
  else if (style.align === "right") x = areaXPts + areaWidthPts - totalWidth;

  for (const run of runs) {
    const font = fontForKinds(fonts, run.kinds);
    const color = run.kinds.has("revision") ? resolveRevisionColor(run.revisionColor) : BLACK;
    const runWidth = drawFallbackText(page, run.text, font, fonts.fallback, {
      x,
      y,
      size: FONT_SIZE,
      color,
    });
    if (run.kinds.has("underline")) {
      page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + runWidth, y: y - 1.5 }, thickness: 0.7, color });
    }
    if (run.kinds.has("strike")) {
      const strikeY = y + FONT_SIZE * 0.3;
      page.drawLine({ start: { x, y: strikeY }, end: { x: x + runWidth, y: strikeY }, thickness: 0.7, color });
    }
    x += runWidth;
  }
}

function drawSceneNumber(page: PDFPage, rowIndex: number, sceneNumber: string, profile: FormatProfile, fonts: CourierFonts): void {
  const y = lineY(profile, rowIndex);
  const widthPts = profile.page.width * POINTS_PER_INCH;
  const marginLeftPts = profile.page.margins.left * POINTS_PER_INCH;
  const marginRightPts = profile.page.margins.right * POINTS_PER_INCH;
  const textWidth = measureText(sceneNumber, FONT_SIZE, fonts.regular, fonts.fallback);

  drawFallbackText(page, sceneNumber, fonts.regular, fonts.fallback, { x: marginLeftPts - textWidth - 10, y, size: FONT_SIZE });
  drawFallbackText(page, sceneNumber, fonts.regular, fonts.fallback, { x: widthPts - marginRightPts + 10, y, size: FONT_SIZE });
}

function drawPageNumber(page: PDFPage, pageNumber: number, profile: FormatProfile, fonts: CourierFonts): void {
  const text = `${pageNumber}.`;
  const widthPts = profile.page.width * POINTS_PER_INCH;
  const heightPts = profile.page.height * POINTS_PER_INCH;
  const marginRightPts = profile.page.margins.right * POINTS_PER_INCH;
  const marginTopPts = profile.page.margins.top * POINTS_PER_INCH;
  const textWidth = fonts.regular.widthOfTextAtSize(text, FONT_SIZE);

  page.drawText(text, {
    x: widthPts - marginRightPts - textWidth,
    y: heightPts - marginTopPts * 0.5,
    size: FONT_SIZE,
    font: fonts.regular,
  });
}

/**
 * Diagonal stamp, roughly centered. pdf-lib rotates text around its anchor
 * (the unrotated baseline start), not the page center, so this is an
 * approximation rather than a geometrically exact center — acceptable for
 * a watermark, and in any case subject to the same pixel-diff human
 * verification gate as the rest of this ticket's rendering.
 */
function drawWatermark(page: PDFPage, text: string, profile: FormatProfile, fonts: CourierFonts): void {
  const widthPts = profile.page.width * POINTS_PER_INCH;
  const heightPts = profile.page.height * POINTS_PER_INCH;
  const size = 48;
  // Watermark is rotated, so it's drawn as one run rather than per-character
  // segmented — pick the whole-string font (fallback if Courier can't take it).
  let wmFont = fonts.bold;
  try {
    fonts.bold.widthOfTextAtSize(text, size);
  } catch {
    wmFont = fonts.fallback;
  }
  const textWidth = wmFont.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: (widthPts - textWidth) / 2,
    y: heightPts / 2,
    size,
    font: wmFont,
    color: rgb(0.75, 0.75, 0.75),
    opacity: 0.4,
    rotate: degrees(45),
  });
}

function drawBodyPage(
  pdfDoc: PDFDocument,
  pmPage: Page,
  profile: FormatProfile,
  fonts: CourierFonts,
  blocksById: Map<string, Block>,
  sceneNumbers: boolean,
): PDFPage {
  const page = pdfDoc.addPage([profile.page.width * POINTS_PER_INCH, profile.page.height * POINTS_PER_INCH]);

  pmPage.lines.forEach((line, rowIndex) => {
    drawContentLine(page, line, rowIndex, profile, fonts);

    if (sceneNumbers && line.blockType === "scene_heading" && line.lineIndexInBlock === 0) {
      const sceneNumber = blocksById.get(line.blockId)?.attrs.sceneNumber;
      if (sceneNumber !== undefined) drawSceneNumber(page, rowIndex, sceneNumber, profile, fonts);
    }
  });

  if (pmPage.pageNumber > 1) drawPageNumber(page, pmPage.pageNumber, profile, fonts);
  return page;
}

/**
 * Renders a paginated screenplay to PDF bytes. Takes a `PageMap` (from
 * screenplay-core's `paginate()`) as the sole source of layout truth — this
 * function only draws what it's given; it never re-wraps, re-paginates, or
 * otherwise makes a layout decision of its own.
 */
export async function renderPdf(
  doc: ScreenplayDocument,
  profile: FormatProfile,
  pageMap: PageMap,
  options: TypesetOptions = {},
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedCourierFonts(pdfDoc);

  const titleBlock = doc.blocks.find((b) => b.type === "title_page");
  if (titleBlock) {
    addTitlePage(pdfDoc, titleBlock, profile, fonts);
    if (options.watermark !== undefined) {
      drawWatermark(pdfDoc.getPage(pdfDoc.getPageCount() - 1), options.watermark, profile, fonts);
    }
  }

  const blocksById = new Map(doc.blocks.map((b) => [b.id, b]));
  for (const pmPage of pageMap.pages) {
    const page = drawBodyPage(pdfDoc, pmPage, profile, fonts, blocksById, options.sceneNumbers ?? false);
    if (options.watermark !== undefined) drawWatermark(page, options.watermark, profile, fonts);
  }

  return pdfDoc.save();
}
