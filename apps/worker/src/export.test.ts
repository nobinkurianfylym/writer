import { describe, it, expect } from "vitest";
import {
  CORPUS,
  serializeFountain,
  serializeFdx,
  paginate,
  usFeatureProfile,
  usTvOneHourProfile,
  type ScreenplayDocument,
} from "@fylym/screenplay-core";
import { PDFDocument } from "pdf-lib";
import { runExport, resolveProfile, stripNonPrinting } from "./export.js";

const decoder = new TextDecoder();

describe("runExport — golden corpus fidelity", () => {
  for (const entry of CORPUS) {
    it(`fountain export matches core serializer for "${entry.name}"`, async () => {
      const doc = entry.build();
      const artifact = await runExport(doc, "fountain", entry.profile, {
        titlePage: true,
      });
      expect(decoder.decode(artifact.bytes)).toBe(serializeFountain(doc));
      expect(artifact.contentType).toContain("fountain");
      expect(artifact.extension).toBe("fountain");
    });

    it(`fdx export matches core serializer for "${entry.name}"`, async () => {
      const doc = entry.build();
      const artifact = await runExport(doc, "fdx", entry.profile, {
        titlePage: true,
      });
      expect(decoder.decode(artifact.bytes)).toBe(serializeFdx(doc));
      expect(artifact.extension).toBe("fdx");
    });

    it(`pdf export renders a valid document for "${entry.name}"`, async () => {
      const doc = entry.build();
      const artifact = await runExport(doc, "pdf", entry.profile);
      expect(artifact.contentType).toBe("application/pdf");
      // Valid PDF header + parseable by pdf-lib with at least one page.
      expect(decoder.decode(artifact.bytes.slice(0, 5))).toBe("%PDF-");
      const parsed = await PDFDocument.load(artifact.bytes);
      expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("runExport — options", () => {
  const withTitle: ScreenplayDocument = {
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "title_page",
        text: "Title: TEST\nAuthor: A. Writer",
        marks: [],
        attrs: {},
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "scene_heading",
        text: "INT. ROOM - DAY",
        marks: [],
        attrs: { sceneNumber: "1" },
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        type: "action",
        text: "A person sits.",
        marks: [],
        attrs: {},
      },
    ],
  };

  it("titlePage:false strips the title page from fountain output", async () => {
    const withTp = decoder.decode(
      (await runExport(withTitle, "fountain", usFeatureProfile, { titlePage: true })).bytes,
    );
    const withoutTp = decoder.decode(
      (await runExport(withTitle, "fountain", usFeatureProfile, { titlePage: false })).bytes,
    );
    expect(withTp).toContain("TEST");
    expect(withoutTp).not.toContain("Title: TEST");
    expect(withoutTp).toContain("INT. ROOM - DAY");
  });

  it("embeds per-request watermark text (distinct texts → distinct bytes)", async () => {
    // pdf-lib deflate-compresses content streams, so the drawn text isn't
    // greppable in the raw bytes; instead we prove the *per-request text*
    // flows into the artifact: a plain PDF, and two differently-watermarked
    // PDFs, are all mutually distinct.
    const plain = await runExport(withTitle, "pdf", usFeatureProfile, {});
    const confidential = await runExport(withTitle, "pdf", usFeatureProfile, {
      watermark: "CONFIDENTIAL",
    });
    const draft = await runExport(withTitle, "pdf", usFeatureProfile, {
      watermark: "DRAFT",
    });

    expect(Buffer.from(confidential.bytes).equals(Buffer.from(plain.bytes))).toBe(false);
    expect(Buffer.from(confidential.bytes).equals(Buffer.from(draft.bytes))).toBe(false);
  });

  it("sceneNumbers option renders without error", async () => {
    const artifact = await runExport(withTitle, "pdf", usFeatureProfile, {
      sceneNumbers: true,
    });
    expect(artifact.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe("stripNonPrinting", () => {
  const outlineDoc: ScreenplayDocument = {
    blocks: [
      { id: "00000000-0000-4000-8000-000000000011", type: "section", text: "ACT I", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000012", type: "synopsis", text: "Setup — meet the hero.", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000013", type: "scene_heading", text: "INT. ROOM - DAY", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000014", type: "note", text: "fix this later", marks: [], attrs: {} },
      { id: "00000000-0000-4000-8000-000000000015", type: "action", text: "A person sits.", marks: [], attrs: {} },
    ],
  };

  it("drops notes, synopses, and (for features) sections from the printed page", () => {
    const stripped = stripNonPrinting(outlineDoc, usFeatureProfile);
    expect(stripped.blocks.map((b) => b.type)).toEqual(["scene_heading", "action"]);
  });

  it("keeps sections when the profile honors act breaks (TV act markers print)", () => {
    const stripped = stripNonPrinting(outlineDoc, usTvOneHourProfile);
    expect(stripped.blocks.map((b) => b.type)).toEqual(["section", "scene_heading", "action"]);
  });

  it("pdf export still renders after stripping, and fountain keeps the markers", async () => {
    const viaExport = await runExport(outlineDoc, "pdf", usFeatureProfile);
    const parsed = await PDFDocument.load(viaExport.bytes);
    expect(parsed.getPageCount()).toBe(1);

    const fountain = decoder.decode(
      (await runExport(outlineDoc, "fountain", usFeatureProfile)).bytes,
    );
    expect(fountain).toContain("# ACT I");
    expect(fountain).toContain("= Setup — meet the hero.");
    expect(fountain).toContain("[[fix this later]]");
  });
});

describe("resolveProfile", () => {
  it("maps known profile names and defaults to us-feature", () => {
    expect(resolveProfile("us-feature")).toBe(usFeatureProfile);
    expect(resolveProfile(undefined).page).toBeDefined();
    expect(resolveProfile("nonsense")).toBe(usFeatureProfile);
  });
});

describe("runExport — 300-page performance", () => {
  it("exports a 300+ page PDF in under 10 seconds", async () => {
    const blocks: ScreenplayDocument["blocks"] = [];
    // ~55 lines/page; each action block below wraps to a few lines. Emit
    // enough to comfortably exceed 300 pages (~13 blocks/page observed).
    for (let i = 0; i < 5000; i++) {
      blocks.push({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        type: "action",
        text: `Beat ${i}. ${"The camera lingers on the empty hallway. ".repeat(3)}`,
        marks: [],
        attrs: {},
      });
    }
    const doc: ScreenplayDocument = { blocks };

    const pages = paginate(doc, usFeatureProfile).pages.length;
    expect(pages).toBeGreaterThan(300);

    const start = performance.now();
    const artifact = await runExport(doc, "pdf", usFeatureProfile);
    const elapsed = performance.now() - start;

    expect(decoder.decode(artifact.bytes.slice(0, 5))).toBe("%PDF-");
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);
});
