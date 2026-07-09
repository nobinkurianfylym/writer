import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Y from "yjs";
import { initProseMirrorDoc } from "y-prosemirror";
import { screenplaySchema } from "./schema.js";
import { toPmDoc, toBlocks } from "./converters.js";
import type { Block } from "@fylym/screenplay-core";
import { createScriptYDoc, initContentFromPmDoc } from "./yjs-binding.js";
import {
  takeSnapshot,
  listSnapshots,
  restoreSnapshot,
  clearSnapshots,
  startAutoSnapshots,
} from "./local-snapshots.js";

function makeBlocks(count: number): Block[] {
  const types = ["scene_heading", "action", "character", "dialogue"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    type: types[i % types.length]!,
    text: i === 0 ? "INT. COFFEE SHOP - DAY" : `Block ${i} content`,
    marks: [],
    attrs: {},
  }));
}

beforeEach(async () => {
  const dbs = await globalThis.indexedDB.databases?.() ?? [];
  for (const db of dbs) {
    if (db.name) globalThis.indexedDB.deleteDatabase(db.name);
  }
});

describe("takeSnapshot", () => {
  it("captures current Y.Doc state with timestamp and scene heading", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(3)));
    const scriptId = crypto.randomUUID();

    const snap = await takeSnapshot(syd, scriptId);

    expect(snap.id).toBeTruthy();
    expect(snap.timestamp).toBeGreaterThan(0);
    expect(snap.sceneHeading).toBe("INT. COFFEE SHOP - DAY");
    expect(snap.state).toBeInstanceOf(Uint8Array);
    expect(snap.state.length).toBeGreaterThan(0);

    syd.destroy();
  });

  it("returns null scene heading when no scene headings exist", async () => {
    const blocks: Block[] = [
      { id: crypto.randomUUID(), type: "action", text: "Some action", marks: [], attrs: {} },
    ];
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(blocks));
    const scriptId = crypto.randomUUID();

    const snap = await takeSnapshot(syd, scriptId);
    expect(snap.sceneHeading).toBeNull();

    syd.destroy();
  });
});

describe("listSnapshots", () => {
  it("returns snapshots sorted newest-first", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));
    const scriptId = crypto.randomUUID();

    await takeSnapshot(syd, scriptId);
    await new Promise((r) => setTimeout(r, 10));
    await takeSnapshot(syd, scriptId);
    await new Promise((r) => setTimeout(r, 10));
    await takeSnapshot(syd, scriptId);

    const list = await listSnapshots(scriptId);
    expect(list).toHaveLength(3);
    expect(list[0]!.timestamp).toBeGreaterThanOrEqual(list[1]!.timestamp);
    expect(list[1]!.timestamp).toBeGreaterThanOrEqual(list[2]!.timestamp);

    for (const item of list) {
      expect(item.id).toBeTruthy();
      expect(item.sceneHeading).toBe("INT. COFFEE SHOP - DAY");
      expect((item as unknown as Record<string, unknown>).state).toBeUndefined();
    }

    syd.destroy();
  });

  it("returns empty array when no snapshots exist", async () => {
    const list = await listSnapshots(crypto.randomUUID());
    expect(list).toHaveLength(0);
  });
});

describe("max retention", () => {
  it("trims oldest snapshots beyond 30", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(1)));
    const scriptId = crypto.randomUUID();

    for (let i = 0; i < 35; i++) {
      await takeSnapshot(syd, scriptId);
    }

    const list = await listSnapshots(scriptId);
    expect(list).toHaveLength(30);

    syd.destroy();
  });
});

describe("restoreSnapshot", () => {
  it("restores doc to snapshot state and creates pre-restore snapshot", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(3)));
    const scriptId = crypto.randomUUID();

    const snap1 = await takeSnapshot(syd, scriptId);

    const el = syd.contentFragment.get(1);
    if (el instanceof Y.XmlElement) {
      const t = el.get(0);
      if (t instanceof Y.XmlText) {
        t.delete(0, t.length);
        t.insert(0, "MODIFIED AFTER SNAPSHOT");
      }
    }

    const { doc: modDoc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    const modBlocks = toBlocks(modDoc);
    expect(modBlocks[1]!.text).toBe("MODIFIED AFTER SNAPSHOT");

    const result = await restoreSnapshot(syd, scriptId, snap1.id);
    expect(result).not.toBeNull();
    expect(result!.preRestoreSnapshotId).toBeTruthy();

    const { doc: restoredDoc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    const restoredBlocks = toBlocks(restoredDoc);
    expect(restoredBlocks[1]!.text).toBe("Block 1 content");

    const list = await listSnapshots(scriptId);
    const preRestoreExists = list.some((s) => s.id === result!.preRestoreSnapshotId);
    expect(preRestoreExists).toBe(true);

    syd.destroy();
  });

  it("returns null for nonexistent snapshot ID", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(1)));

    const result = await restoreSnapshot(syd, crypto.randomUUID(), "nonexistent-id");
    expect(result).toBeNull();

    syd.destroy();
  });

  it("pre-restore snapshot is itself restorable (undo restore)", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));
    const scriptId = crypto.randomUUID();

    const snap1 = await takeSnapshot(syd, scriptId);

    const el = syd.contentFragment.get(0);
    if (el instanceof Y.XmlElement) {
      const t = el.get(0);
      if (t instanceof Y.XmlText) {
        t.insert(0, "EDITED ");
      }
    }

    const { doc: editedDoc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    const editedText = toBlocks(editedDoc)[0]!.text;
    expect(editedText).toContain("EDITED");

    const result = await restoreSnapshot(syd, scriptId, snap1.id);

    const { doc: restoredDoc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    expect(toBlocks(restoredDoc)[0]!.text).not.toContain("EDITED");

    const undoResult = await restoreSnapshot(syd, scriptId, result!.preRestoreSnapshotId);
    expect(undoResult).not.toBeNull();

    const { doc: undoneDoc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    expect(toBlocks(undoneDoc)[0]!.text).toContain("EDITED");

    syd.destroy();
  });
});

describe("clearSnapshots", () => {
  it("removes all snapshots for a script", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));
    const scriptId = crypto.randomUUID();

    await takeSnapshot(syd, scriptId);
    await takeSnapshot(syd, scriptId);

    let list = await listSnapshots(scriptId);
    expect(list).toHaveLength(2);

    await clearSnapshots(scriptId);

    list = await listSnapshots(scriptId);
    expect(list).toHaveLength(0);

    syd.destroy();
  });
});

describe("startAutoSnapshots", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes snapshot after interval when activity detected", async () => {
    vi.useFakeTimers();
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));
    const scriptId = crypto.randomUUID();

    const handle = startAutoSnapshots(syd, scriptId, 100);

    const el = syd.contentFragment.get(0);
    if (el instanceof Y.XmlElement) {
      const t = el.get(0);
      if (t instanceof Y.XmlText) {
        t.insert(0, "trigger ");
      }
    }

    await vi.advanceTimersByTimeAsync(150);

    vi.useRealTimers();
    const list = await listSnapshots(scriptId);
    expect(list.length).toBeGreaterThanOrEqual(1);

    handle.stop();
    syd.destroy();
  });

  it("does not snapshot without activity", async () => {
    vi.useFakeTimers();
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(1)));
    const scriptId = crypto.randomUUID();

    const handle = startAutoSnapshots(syd, scriptId, 100);

    await vi.advanceTimersByTimeAsync(250);

    vi.useRealTimers();
    const list = await listSnapshots(scriptId);
    expect(list).toHaveLength(0);

    handle.stop();
    syd.destroy();
  });

  it("takeNow forces immediate snapshot", async () => {
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));
    const scriptId = crypto.randomUUID();

    const handle = startAutoSnapshots(syd, scriptId, 60_000);
    const snap = await handle.takeNow();

    expect(snap.id).toBeTruthy();
    expect(snap.sceneHeading).toBe("INT. COFFEE SHOP - DAY");

    const list = await listSnapshots(scriptId);
    expect(list).toHaveLength(1);

    handle.stop();
    syd.destroy();
  });
});
