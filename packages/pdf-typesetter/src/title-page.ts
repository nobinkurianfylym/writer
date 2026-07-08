import type { PDFDocument } from "pdf-lib";
import type { Block, FormatProfile } from "@fylym/screenplay-core";
import type { CourierFonts } from "./fonts.js";

const POINTS_PER_INCH = 72;

/**
 * Composes a title page from a `title_page` Block's raw text (newline-
 * joined lines — see screenplay-core's fountain/parse.ts and fdx/parse.ts).
 * There's no single authoritative "correct" title-page layout the way there
 * is for body pagination — this centers every non-blank line, stacked with
 * generous spacing starting a third of the way down the page, which is a
 * reasonable and common convention but an interpretive judgment call, not a
 * derived accept criterion. Inline marks on title-page text are not
 * rendered (title pages rarely carry them, and the FDX importer doesn't
 * currently decode them either — see fdx/parse.ts's parseTitlePage).
 */
export function addTitlePage(
  pdfDoc: PDFDocument,
  titleBlock: Block,
  profile: FormatProfile,
  fonts: CourierFonts,
): void {
  const widthPts = profile.page.width * POINTS_PER_INCH;
  const heightPts = profile.page.height * POINTS_PER_INCH;
  const page = pdfDoc.addPage([widthPts, heightPts]);

  const fontSize = 12;
  const lineHeight = fontSize * 2; // double-spaced, standard title-page convention
  const lines = titleBlock.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  let y = heightPts * 0.6;
  for (const line of lines) {
    const textWidth = fonts.regular.widthOfTextAtSize(line, fontSize);
    page.drawText(line, {
      x: (widthPts - textWidth) / 2,
      y,
      size: fontSize,
      font: fonts.regular,
    });
    y -= lineHeight;
  }
}
