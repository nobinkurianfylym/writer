import zlib from "node:zlib";
import fc from "fast-check";
import { PDFArray, PDFDocument, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  normalize,
  paginate,
  usFeatureProfile,
  usTvOneHourProfile,
  type Block,
  type FormatProfile,
  type ScreenplayDocument,
} from "@fylym/screenplay-core";
import { arbitraryDocument } from "@fylym/screenplay-core/testing";
import { renderPdf } from "./typeset.js";

function block(type: Block["type"], text: string, overrides: Partial<Block> = {}): Block {
  return { id: crypto.randomUUID(), type, text, marks: [], attrs: {}, ...overrides };
}

const SAMPLE_DOC: ScreenplayDocument = {
  blocks: [
    block("scene_heading", "INT. HOUSE - DAY", { attrs: { sceneNumber: "1" } }),
    block(
      "action",
      "Maya walks slowly across the room toward the window, watching the rain fall on the empty street below her apartment.",
    ),
    block("character", "MAYA"),
    block("dialogue", "Well, this is it."),
    block("scene_heading", "EXT. STREET - NIGHT", { attrs: { sceneNumber: "2" } }),
    block("action", "Rain pours down."),
  ],
};

/** Decodes a PDF page's content stream(s) to raw operator text, for asserting what a page actually drew (not just what our own code intended to draw). */
function decodePageContent(page: PDFPage): string {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => contents.get(i)) : [contents];

  let text = "";
  for (const ref of refs) {
    const stream = page.node.context.lookup(ref);
    // @ts-expect-error -- `contents` is an internal-but-stable field on PDFRawStream, not part of pdf-lib's public typings.
    const raw = stream.contents as Uint8Array;
    try {
      text += zlib.inflateSync(Buffer.from(raw)).toString("latin1");
    } catch {
      text += Buffer.from(raw).toString("latin1");
    }
  }
  return text;
}

/** pdf-lib emits drawn text as uppercase-hex `<...>` string literals; this is the substring that would appear if `text` were drawn verbatim in a Tj/TJ operator. */
function hexLiteralFor(text: string): string {
  return Buffer.from(text, "latin1").toString("hex").toUpperCase();
}

describe("renderPdf: PDF page count matches PageMap page count (property)", () => {
  it("holds for arbitrary valid documents against both shipped profiles", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryDocument, fc.constantFrom<FormatProfile>(usFeatureProfile, usTvOneHourProfile), async (raw, profile) => {
        const doc = normalize(raw);
        const pageMap = paginate(doc, profile);
        const bytes = await renderPdf(doc, profile, pageMap);
        const loaded = await PDFDocument.load(bytes);
        const hasTitlePage = doc.blocks.some((b) => b.type === "title_page");
        // The PDF format (and pdf-lib on save) requires at least one page,
        // so a completely empty document (0 PageMap pages, no title page)
        // still yields a 1-page PDF — a format floor, not a pagination
        // mismatch. Every other case is an exact match.
        expect(loaded.getPageCount()).toBe(Math.max(1, pageMap.pages.length + (hasTitlePage ? 1 : 0)));
      }),
      { numRuns: 500 },
    );
  });

  it("adds exactly one extra page for a title page, regardless of body length", async () => {
    const withTitle: ScreenplayDocument = { blocks: [block("title_page", "MY SCRIPT"), ...SAMPLE_DOC.blocks] };
    const pageMap = paginate(withTitle, usFeatureProfile);
    const bytes = await renderPdf(withTitle, usFeatureProfile, pageMap);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(pageMap.pages.length + 1);
  });

  it("adds no extra page when there is no title page", async () => {
    const pageMap = paginate(SAMPLE_DOC, usFeatureProfile);
    const bytes = await renderPdf(SAMPLE_DOC, usFeatureProfile, pageMap);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(pageMap.pages.length);
  });
});

describe("renderPdf: watermark", () => {
  it("embeds the watermark string on every page, including the title page", async () => {
    const withTitle: ScreenplayDocument = { blocks: [block("title_page", "MY SCRIPT"), ...SAMPLE_DOC.blocks] };
    const pageMap = paginate(withTitle, usFeatureProfile);
    const watermark = "DRAFT-XYZ-NOT-FOR-DISTRIBUTION";
    const bytes = await renderPdf(withTitle, usFeatureProfile, pageMap, { watermark });

    const loaded = await PDFDocument.load(bytes);
    const needle = hexLiteralFor(watermark);
    for (const page of loaded.getPages()) {
      expect(decodePageContent(page)).toContain(needle);
    }
  });

  it("embeds no watermark text when the option is omitted", async () => {
    const pageMap = paginate(SAMPLE_DOC, usFeatureProfile);
    const bytes = await renderPdf(SAMPLE_DOC, usFeatureProfile, pageMap);
    const loaded = await PDFDocument.load(bytes);
    const needle = hexLiteralFor("DRAFT-XYZ-NOT-FOR-DISTRIBUTION");
    for (const page of loaded.getPages()) {
      expect(decodePageContent(page)).not.toContain(needle);
    }
  });
});

describe("renderPdf: scene numbers", () => {
  it("draws each scene heading's sceneNumber (twice — both margins) when sceneNumbers is true", async () => {
    const pageMap = paginate(SAMPLE_DOC, usFeatureProfile);
    const bytes = await renderPdf(SAMPLE_DOC, usFeatureProfile, pageMap, { sceneNumbers: true });
    const loaded = await PDFDocument.load(bytes);
    const content = loaded.getPages().map(decodePageContent).join("\n");

    const occurrences1 = content.split(hexLiteralFor("1")).length - 1;
    const occurrences2 = content.split(hexLiteralFor("2")).length - 1;
    expect(occurrences1).toBeGreaterThanOrEqual(2);
    expect(occurrences2).toBeGreaterThanOrEqual(2);
  });

  it("draws no scene numbers when the option is omitted (default false)", async () => {
    const pageMap = paginate(SAMPLE_DOC, usFeatureProfile);
    const bytes = await renderPdf(SAMPLE_DOC, usFeatureProfile, pageMap);
    const loaded = await PDFDocument.load(bytes);
    // "1" still legitimately never appears via scene numbers; check it
    // doesn't appear as a standalone hex token flanked the way our
    // scene-number draw would place it — simplest robust check: total
    // occurrences of the digit shouldn't include the extra margin copies.
    const withNumbers = await renderPdf(SAMPLE_DOC, usFeatureProfile, pageMap, { sceneNumbers: true });
    const loadedWithNumbers = await PDFDocument.load(withNumbers);
    const contentWithout = loaded.getPages().map(decodePageContent).join("\n");
    const contentWith = loadedWithNumbers.getPages().map(decodePageContent).join("\n");
    const countIn = (s: string, needle: string) => s.split(needle).length - 1;
    expect(countIn(contentWithout, hexLiteralFor("1"))).toBeLessThan(countIn(contentWith, hexLiteralFor("1")));
  });
});

describe("renderPdf: title page", () => {
  it("renders the title_page block's lines on a dedicated first page", async () => {
    const withTitle: ScreenplayDocument = {
      blocks: [block("title_page", "MY GREAT SCRIPT\nWritten by\nA. Writer"), ...SAMPLE_DOC.blocks],
    };
    const pageMap = paginate(withTitle, usFeatureProfile);
    const bytes = await renderPdf(withTitle, usFeatureProfile, pageMap);
    const loaded = await PDFDocument.load(bytes);
    const titlePageContent = decodePageContent(loaded.getPages()[0]!);
    expect(titlePageContent).toContain(hexLiteralFor("MY GREAT SCRIPT"));
    expect(titlePageContent).toContain(hexLiteralFor("Written by"));
  });
});

describe("renderPdf: never throws for arbitrary valid documents (property)", () => {
  it("holds across both shipped profiles with every option combination", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDocument,
        fc.constantFrom<FormatProfile>(usFeatureProfile, usTvOneHourProfile),
        fc.boolean(),
        fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
        async (raw, profile, sceneNumbers, watermark) => {
          const doc = normalize(raw);
          const pageMap = paginate(doc, profile);
          await expect(renderPdf(doc, profile, pageMap, { sceneNumbers, watermark })).resolves.toBeInstanceOf(Uint8Array);
        },
      ),
      { numRuns: 300 },
    );
  });
});
