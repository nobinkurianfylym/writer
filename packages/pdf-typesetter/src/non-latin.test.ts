import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { paginate, usFeatureProfile, type ScreenplayDocument } from "@fylym/screenplay-core";
import { renderPdf } from "./typeset.js";

/**
 * Courier (a PDF base-14 font) has no glyphs outside Latin/WinAnsi. The
 * typesetter routes such text to an embedded Unicode fallback (Gayathri),
 * which fontkit shapes. This exercises Malayalam — including the ണ്ട്
 * conjunct that crashes some Malayalam fonts under fontkit — and a mix of
 * Malayalam and Latin on one line.
 */
describe("renderPdf — non-Latin (Malayalam) fallback", () => {
  const doc: ScreenplayDocument = {
    blocks: [
      { id: "00000000-0000-4000-8000-000000000001", type: "scene_heading", text: "INT. വീട് - DAY", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000002", type: "action", text: "എന്റെ ദൈവമേ. njaan ഇവിടെ ഉണ്ട്.", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000003", type: "character", text: "അലക്സ്", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000004", type: "dialogue", text: "നമസ്കാരം. Hello there.", marks: [], attrs: {} },
    ],
  };

  it("renders mixed Malayalam + Latin to a valid PDF without throwing", async () => {
    const bytes = await renderPdf(doc, usFeatureProfile, paginate(doc, usFeatureProfile), {});
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders a Malayalam title page", async () => {
    const withTitle: ScreenplayDocument = {
      blocks: [
        { id: "00000000-0000-4000-8000-000000000010", type: "title_page", text: "Title: എന്റെ കഥ\nAuthor: നോബിൻ", marks: [], attrs: {} },
        ...doc.blocks,
      ],
    };
    const bytes = await renderPdf(withTitle, usFeatureProfile, paginate(withTitle, usFeatureProfile), {});
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
