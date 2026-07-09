import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { initProseMirrorDoc } from "y-prosemirror";
import { screenplaySchema } from "./schema.js";
import { toPmDoc, toBlocks } from "./converters.js";
import type { Block } from "@fylym/screenplay-core";
import {
  createScriptYDoc,
  initContentFromPmDoc,
  setTitlePageFields,
  getTitlePageFields,
} from "./yjs-binding.js";
import {
  createScriptPersistence,
  clearScriptStorage,
  dbNameForScript,
  type PersistenceStatus,
} from "./idb-persistence.js";

function makeBlocks(count: number): Block[] {
  const types = ["scene_heading", "action", "character", "dialogue"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    type: types[i % types.length]!,
    text: `Block ${i} content`,
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

describe("dbNameForScript", () => {
  it("prefixes script ID with fylym-script-", () => {
    expect(dbNameForScript("abc-123")).toBe("fylym-script-abc-123");
  });
});

describe("createScriptPersistence", () => {
  it("starts in loading status and transitions to synced", async () => {
    const syd = createScriptYDoc({ scriptId: "test-persist-1" });
    const blocks = makeBlocks(3);
    initContentFromPmDoc(syd, toPmDoc(blocks));

    const statuses: PersistenceStatus[] = [];
    const persistence = createScriptPersistence({
      scriptId: "test-persist-1",
      scriptYDoc: syd,
      onStatusChange: (s) => statuses.push(s),
    });

    expect(persistence.status).toBe("loading");

    await persistence.whenSynced;

    expect(persistence.status).toBe("synced");
    expect(statuses).toContain("synced");
    expect(persistence.warning).toBeNull();

    await persistence.destroy();
    syd.destroy();
  });

  it("persists content across provider destroy/recreate", async () => {
    const scriptId = crypto.randomUUID();
    const blocks = makeBlocks(4);

    const syd1 = createScriptYDoc({ scriptId: `persist-${scriptId}` });
    initContentFromPmDoc(syd1, toPmDoc(blocks));

    const p1 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd1,
    });
    await p1.whenSynced;

    const textNode = syd1.contentFragment.get(0);
    if (textNode instanceof Y.XmlElement) {
      const t = textNode.get(0);
      if (t instanceof Y.XmlText) {
        t.insert(0, "PERSISTED ");
      }
    }

    await new Promise((r) => setTimeout(r, 50));
    await p1.destroy();
    syd1.destroy();

    const syd2 = createScriptYDoc({ scriptId: `persist-${scriptId}-2` });
    const p2 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd2,
    });
    await p2.whenSynced;

    const { doc } = initProseMirrorDoc(syd2.contentFragment, screenplaySchema);
    const recovered = toBlocks(doc);
    expect(recovered[0]!.text).toContain("PERSISTED");
    expect(recovered).toHaveLength(4);

    await p2.destroy();
    syd2.destroy();
  });

  it("persists meta (title page) across sessions", async () => {
    const scriptId = crypto.randomUUID();

    const syd1 = createScriptYDoc({ scriptId: `meta-${scriptId}` });
    initContentFromPmDoc(syd1, toPmDoc(makeBlocks(1)));
    setTitlePageFields(syd1.meta, {
      title: "My Screenplay",
      credit: "written by",
      author: "Jane Doe",
      source: "",
      draftDate: "July 2026",
      contact: "",
      copyright: "",
      notes: "",
      revision: "",
    });

    const p1 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd1,
    });
    await p1.whenSynced;
    await new Promise((r) => setTimeout(r, 50));
    await p1.destroy();
    syd1.destroy();

    const syd2 = createScriptYDoc({ scriptId: `meta-${scriptId}-2` });
    const p2 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd2,
    });
    await p2.whenSynced;

    const fields = getTitlePageFields(syd2.meta);
    expect(fields.title).toBe("My Screenplay");
    expect(fields.author).toBe("Jane Doe");
    expect(fields.draftDate).toBe("July 2026");

    await p2.destroy();
    syd2.destroy();
  });
});

describe("clearScriptStorage", () => {
  it("removes all data for a script", async () => {
    const scriptId = crypto.randomUUID();

    const syd1 = createScriptYDoc({ scriptId: `clear-${scriptId}` });
    initContentFromPmDoc(syd1, toPmDoc(makeBlocks(3)));

    const p1 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd1,
    });
    await p1.whenSynced;
    await p1.destroy();
    syd1.destroy();

    await clearScriptStorage(scriptId);

    const syd2 = createScriptYDoc({ scriptId: `clear-${scriptId}-2` });
    const p2 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd2,
    });
    await p2.whenSynced;

    expect(syd2.contentFragment.length).toBe(0);

    await p2.destroy();
    syd2.destroy();
  });
});

describe("multiple concurrent edits persist", () => {
  it("rapid edits are all captured", async () => {
    const scriptId = crypto.randomUUID();
    const syd = createScriptYDoc({ scriptId: `rapid-${scriptId}` });
    initContentFromPmDoc(syd, toPmDoc(makeBlocks(2)));

    const p = createScriptPersistence({
      scriptId,
      scriptYDoc: syd,
    });
    await p.whenSynced;

    const el = syd.contentFragment.get(0);
    if (el instanceof Y.XmlElement) {
      const t = el.get(0);
      if (t instanceof Y.XmlText) {
        for (let i = 0; i < 20; i++) {
          t.insert(t.length, `edit${i} `);
        }
      }
    }

    await new Promise((r) => setTimeout(r, 100));
    await p.destroy();
    syd.destroy();

    const syd2 = createScriptYDoc({ scriptId: `rapid-${scriptId}-2` });
    const p2 = createScriptPersistence({
      scriptId,
      scriptYDoc: syd2,
    });
    await p2.whenSynced;

    const { doc } = initProseMirrorDoc(syd2.contentFragment, screenplaySchema);
    const recovered = toBlocks(doc);
    expect(recovered[0]!.text).toContain("edit19");

    await p2.destroy();
    syd2.destroy();
  });
});
