import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { toPmDoc } from "@fylym/editor";
import { hydrateFromYUpdate } from "@fylym/editor/headless";
import { serializeFountain, type ScreenplayDocument } from "@fylym/screenplay-core";
import { runExportJob, type ScriptStateReader } from "./export-job.js";
import type { ArtifactStore } from "../s3.js";
import type { ProgressReporter } from "./demo.js";

/** Build an encoded Yjs update carrying the given blocks in the content fragment. */
function encodeState(doc: ScreenplayDocument): Uint8Array {
  const ydoc = new Y.Doc();
  const pm = toPmDoc(doc.blocks);
  prosemirrorToYXmlFragment(pm, ydoc.getXmlFragment("content"));
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

class RecordingReporter implements ProgressReporter {
  readonly values: number[] = [];
  async updateProgress(p: number) {
    this.values.push(p);
  }
}

function makeDeps(
  script: {
    ydocState: Uint8Array | null;
    formatProfile?: string;
    deletedAt?: Date | null;
  } | null,
) {
  const put = vi.fn().mockResolvedValue(undefined);
  const store = { put } as unknown as ArtifactStore;
  const db: ScriptStateReader = {
    script: {
      findUnique: vi.fn().mockResolvedValue(
        script && {
          ydocState: script.ydocState,
          formatProfile: script.formatProfile ?? "us-feature",
          deletedAt: script.deletedAt ?? null,
        },
      ),
    },
  };
  return { db, store, put };
}

describe("export processor — hydration round-trip", () => {
  it("hydrates stored Yjs state back to the original block sequence", () => {
    const update = encodeState(SAMPLE);
    const { document } = hydrateFromYUpdate(update);
    expect(document.blocks.map((b) => [b.type, b.text])).toEqual(
      SAMPLE.blocks.map((b) => [b.type, b.text]),
    );
  });

  it("exports the hydrated document and stores it in S3", async () => {
    const update = encodeState(SAMPLE);
    const { db, store, put } = makeDeps({ ydocState: update });
    const reporter = new RecordingReporter();

    const result = await runExportJob(
      { kind: "export", scriptId: "s1", format: "fountain", requestedBy: "u1" },
      reporter,
      { db, store },
    );

    expect(put).toHaveBeenCalledOnce();
    const [key, bytes, contentType] = put.mock.calls[0]!;
    expect(key).toMatch(/^exports\/s1\/\d+\.fountain$/);
    expect(contentType).toContain("fountain");
    // Bytes written equal the core serialization of the hydrated doc.
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe(
      serializeFountain(SAMPLE),
    );

    expect(result.s3Key).toBe(key);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(reporter.values[0]).toBe(5);
    expect(reporter.values.at(-1)).toBe(100);
  });

  it("throws when the script is missing", async () => {
    const { db, store } = makeDeps(null);
    await expect(
      runExportJob(
        { kind: "export", scriptId: "gone", format: "pdf", requestedBy: "u1" },
        new RecordingReporter(),
        { db, store },
      ),
    ).rejects.toThrow("Script not found");
  });

  it("throws when the script has no stored state", async () => {
    const { db, store } = makeDeps({ ydocState: null });
    await expect(
      runExportJob(
        { kind: "export", scriptId: "s1", format: "pdf", requestedBy: "u1" },
        new RecordingReporter(),
        { db, store },
      ),
    ).rejects.toThrow("no stored state");
  });

  it("throws when the script is soft-deleted", async () => {
    const { db, store } = makeDeps({
      ydocState: encodeState(SAMPLE),
      deletedAt: new Date(),
    });
    await expect(
      runExportJob(
        { kind: "export", scriptId: "s1", format: "pdf", requestedBy: "u1" },
        new RecordingReporter(),
        { db, store },
      ),
    ).rejects.toThrow("Script not found");
  });
});
