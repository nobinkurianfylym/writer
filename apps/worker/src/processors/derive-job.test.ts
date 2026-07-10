import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { toPmDoc } from "@fylym/editor";
import type { ScreenplayDocument } from "@fylym/screenplay-core";
import {
  runDeriveJob,
  type DeriveProcessorDeps,
  type SceneIndexRow,
} from "./derive-job.js";
import type { ProgressReporter } from "./demo.js";

function encodeState(doc: ScreenplayDocument): Uint8Array {
  const ydoc = new Y.Doc();
  prosemirrorToYXmlFragment(toPmDoc(doc.blocks), ydoc.getXmlFragment("content"));
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

let seq = 0;
function bid(): string {
  return `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
}
function block(type: string, text: string, id = bid()) {
  return { id, type: type as never, text, marks: [], attrs: {} };
}

/** In-memory SceneIndex table implementing the deleteMany/upsert surface. */
class FakeSceneIndex {
  rows = new Map<string, SceneIndexRow>();

  sceneIndex = {
    deleteMany: async (args: {
      where: { scriptId: string; id?: { notIn: string[] } };
    }) => {
      let count = 0;
      const keep = args.where.id?.notIn;
      for (const [key, row] of this.rows) {
        if (row.scriptId !== args.where.scriptId) continue;
        if (keep && keep.includes(key)) continue;
        this.rows.delete(key);
        count++;
      }
      return { count };
    },
    upsert: async (args: {
      where: { id: string };
      create: SceneIndexRow;
      update: Omit<SceneIndexRow, "id" | "scriptId">;
    }) => {
      const existing = this.rows.get(args.where.id);
      if (existing) {
        this.rows.set(args.where.id, { ...existing, ...args.update });
      } else {
        this.rows.set(args.where.id, args.create);
      }
      return this.rows.get(args.where.id);
    },
  };
}

function makeDeps(
  ydocState: Uint8Array | null,
  table: FakeSceneIndex,
  opts: { deletedAt?: Date | null; formatProfile?: string } = {},
): DeriveProcessorDeps {
  return {
    db: {
      script: {
        findUnique: async () =>
          ydocState === null && opts.deletedAt === undefined
            ? null
            : {
                ydocState,
                formatProfile: opts.formatProfile ?? "us-feature",
                deletedAt: opts.deletedAt ?? null,
              },
      },
      sceneIndex: table.sceneIndex,
    },
  };
}

const noProgress: ProgressReporter = { updateProgress: async () => {} };

describe("runDeriveJob — reconcile", () => {
  it("inserts a row per scene on first derive", async () => {
    const sceneA = block("scene_heading", "INT. HOUSE - DAY");
    const sceneB = block("scene_heading", "EXT. STREET - NIGHT");
    const doc: ScreenplayDocument = {
      blocks: [sceneA, block("action", "Body."), sceneB],
    };
    const table = new FakeSceneIndex();

    const result = await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState(doc), table),
    );

    expect(result.sceneCount).toBe(2);
    expect(table.rows.size).toBe(2);
    expect(table.rows.get(sceneA.id)!.heading).toBe("INT. HOUSE - DAY");
  });

  it("updates the row in place when a heading is edited (same id)", async () => {
    const scene = block("scene_heading", "INT. HOUSE - DAY");
    const table = new FakeSceneIndex();

    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [scene, block("action", "x")] }), table),
    );
    expect(table.rows.get(scene.id)!.heading).toBe("INT. HOUSE - DAY");

    // Same block id, edited heading text.
    const edited = { ...scene, text: "INT. HOUSE - NIGHT" };
    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [edited, block("action", "x")] }), table),
    );

    expect(table.rows.size).toBe(1);
    expect(table.rows.get(scene.id)!.heading).toBe("INT. HOUSE - NIGHT");
    expect(table.rows.get(scene.id)!.timeOfDay).toBe("NIGHT");
  });

  it("reorders position when scenes are reordered", async () => {
    const a = block("scene_heading", "INT. A - DAY");
    const b = block("scene_heading", "INT. B - DAY");
    const table = new FakeSceneIndex();

    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [a, b] }), table),
    );
    expect(table.rows.get(a.id)!.position).toBe(0);
    expect(table.rows.get(b.id)!.position).toBe(1);

    // Swap order.
    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [b, a] }), table),
    );
    expect(table.rows.get(b.id)!.position).toBe(0);
    expect(table.rows.get(a.id)!.position).toBe(1);
    expect(table.rows.size).toBe(2);
  });

  it("prunes rows for scenes that were removed", async () => {
    const a = block("scene_heading", "INT. A - DAY");
    const b = block("scene_heading", "INT. B - DAY");
    const table = new FakeSceneIndex();

    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [a, b] }), table),
    );
    expect(table.rows.size).toBe(2);

    // Remove scene B.
    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [a] }), table),
    );
    expect(table.rows.size).toBe(1);
    expect(table.rows.has(a.id)).toBe(true);
    expect(table.rows.has(b.id)).toBe(false);
  });

  it("clears all rows when the document has no scenes", async () => {
    const a = block("scene_heading", "INT. A - DAY");
    const table = new FakeSceneIndex();
    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [a] }), table),
    );
    expect(table.rows.size).toBe(1);

    await runDeriveJob(
      { kind: "derive", scriptId: "s1" },
      noProgress,
      makeDeps(encodeState({ blocks: [block("action", "just action")] }), table),
    );
    expect(table.rows.size).toBe(0);
  });

  it("throws when the script has no stored state", async () => {
    const table = new FakeSceneIndex();
    await expect(
      runDeriveJob(
        { kind: "derive", scriptId: "s1" },
        noProgress,
        makeDeps(null, table, { deletedAt: null }),
      ),
    ).rejects.toThrow("no stored state");
  });

  it("throws when the script is missing", async () => {
    const table = new FakeSceneIndex();
    await expect(
      runDeriveJob(
        { kind: "derive", scriptId: "gone" },
        noProgress,
        makeDeps(null, table),
      ),
    ).rejects.toThrow("Script not found");
  });
});
