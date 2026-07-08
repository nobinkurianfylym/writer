import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import type { MarkKind } from "@fylym/screenplay-core";

export interface CourierFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

/** Embeds the 12pt Courier family as PDF's base-14 standard fonts — no font file needed, every PDF viewer ships them. */
export async function embedCourierFonts(pdfDoc: PDFDocument): Promise<CourierFonts> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Courier),
    pdfDoc.embedFont(StandardFonts.CourierBold),
    pdfDoc.embedFont(StandardFonts.CourierOblique),
    pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
  ]);
  return { regular, bold, italic, boldItalic };
}

/** Picks the right Courier variant for a run's active bold/italic marks (underline/strike/revision are drawn separately, not font variants). */
export function fontForKinds(fonts: CourierFonts, kinds: ReadonlySet<MarkKind>): PDFFont {
  const bold = kinds.has("bold");
  const italic = kinds.has("italic");
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}
