import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { toPmDoc } from "@fylym/editor";
import { PDFDocument } from "pdf-lib";
import type { ScreenplayDocument } from "@fylym/screenplay-core";
import { exportFromYState } from "./export-inline.js";

/** Encode a screenplay document to the same Yjs update shape the app persists. */
function encodeState(doc: ScreenplayDocument): Uint8Array {
  const ydoc = new Y.Doc();
  prosemirrorToYXmlFragment(toPmDoc(doc.blocks), ydoc.getXmlFragment("content"));
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

const SAMPLE: ScreenplayDocument = {
  blocks: [
    { id: "00000000-0000-4000-8000-000000000001", type: "scene_heading", text: "INT. HOUSE - DAY", marks: [], attrs: {} },
    { id: "00000000-0000-4000-8000-000000000002", type: "action", text: "A quiet room.", marks: [], attrs: {} },
    { id: "00000000-0000-4000-8000-000000000003", type: "character", text: "ALEX", marks: [], attrs: {} },
    { id: "00000000-0000-4000-8000-000000000004", type: "dialogue", text: "Hello.", marks: [], attrs: {} },
  ],
};

describe("exportFromYState — hydrate + export in one call", () => {
  it("renders a valid PDF from persisted Yjs state", async () => {
    const artifact = await exportFromYState(
      encodeState(SAMPLE),
      "us-feature",
      "pdf",
      { sceneNumbers: true, titlePage: true },
    );
    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.extension).toBe("pdf");
    expect(new TextDecoder().decode(artifact.bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(artifact.bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders fountain and fdx text carrying the scene content", async () => {
    const fountain = await exportFromYState(encodeState(SAMPLE), "us-feature", "fountain", {});
    expect(new TextDecoder().decode(fountain.bytes)).toContain("INT. HOUSE - DAY");
    expect(fountain.extension).toBe("fountain");

    const fdx = await exportFromYState(encodeState(SAMPLE), "us-feature", "fdx", {});
    expect(new TextDecoder().decode(fdx.bytes)).toContain("INT. HOUSE - DAY");
    expect(fdx.extension).toBe("fdx");
  });
});
