import {
  StandardFonts,
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import * as fontkit from "fontkit";
import type { MarkKind } from "@fylym/screenplay-core";
import { FALLBACK_FONT_BASE64 } from "./fallback-font.js";

export interface CourierFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  /** Unicode fallback (Noto Sans Malayalam) for glyphs Courier can't encode. */
  fallback: PDFFont;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Embeds the 12pt Courier family (PDF base-14 standard fonts — every viewer
 * ships them) plus a Unicode fallback face. Courier has no glyphs outside
 * Latin/WinAnsi, so any non-Latin text (e.g. Malayalam) is drawn with the
 * embedded fallback, which fontkit shapes correctly.
 */
export async function embedCourierFonts(pdfDoc: PDFDocument): Promise<CourierFonts> {
  pdfDoc.registerFontkit(fontkit as never);
  const [regular, bold, italic, boldItalic] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Courier),
    pdfDoc.embedFont(StandardFonts.CourierBold),
    pdfDoc.embedFont(StandardFonts.CourierOblique),
    pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
  ]);
  const fallback = await pdfDoc.embedFont(base64ToBytes(FALLBACK_FONT_BASE64));
  return { regular, bold, italic, boldItalic, fallback };
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

// ── Fallback-aware text drawing ──────────────────────────────────────────
// Courier (a base-14 font) only encodes WinAnsi. We test each code point and
// route the ones Courier can't render to the embedded Unicode fallback, so a
// single line can mix Latin and Malayalam. Pure-Latin text yields one segment
// in the primary font — byte-identical to drawing it directly.

const courierEncodable = new Map<number, boolean>();

function canEncode(courier: PDFFont, codePoint: number): boolean {
  const cached = courierEncodable.get(codePoint);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    courier.encodeText(String.fromCodePoint(codePoint));
  } catch {
    ok = false;
  }
  courierEncodable.set(codePoint, ok);
  return ok;
}

interface Segment {
  font: PDFFont;
  text: string;
}

function segmentByFont(text: string, primary: PDFFont, fallback: PDFFont): Segment[] {
  const segments: Segment[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const font = canEncode(primary, cp) ? primary : fallback;
    const last = segments[segments.length - 1];
    if (last && last.font === font) last.text += ch;
    else segments.push({ font, text: ch });
  }
  return segments;
}

/** Width of `text` at `size`, measuring each run in whichever font will draw it. */
export function measureText(
  text: string,
  size: number,
  primary: PDFFont,
  fallback: PDFFont,
): number {
  let width = 0;
  for (const seg of segmentByFont(text, primary, fallback)) {
    width += seg.font.widthOfTextAtSize(seg.text, size);
  }
  return width;
}

/** Draws `text` at (x, y), falling back per-character, and returns the total width drawn. */
export function drawText(
  page: PDFPage,
  text: string,
  primary: PDFFont,
  fallback: PDFFont,
  opts: { x: number; y: number; size: number; color?: Color },
): number {
  let x = opts.x;
  for (const seg of segmentByFont(text, primary, fallback)) {
    page.drawText(seg.text, { x, y: opts.y, size: opts.size, font: seg.font, color: opts.color });
    x += seg.font.widthOfTextAtSize(seg.text, opts.size);
  }
  return x - opts.x;
}
