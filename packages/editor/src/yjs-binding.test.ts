import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import { initProseMirrorDoc } from "y-prosemirror";
import { screenplaySchema } from "./schema.js";
import { toPmDoc, toBlocks } from "./converters.js";
import type { Block } from "@fylym/screenplay-core";
import {
  createScriptYDoc,
  initContentFromPmDoc,
  yjsPlugins,
  setTitlePageFields,
  getTitlePageFields,
  setMeta,
  getMeta,
  setFormatProfileName,
  getFormatProfileName,
  observeMeta,
} from "./yjs-binding.js";

function makeBlocks(count: number): Block[] {
  const types = ["scene_heading", "action", "character", "dialogue", "parenthetical", "transition"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    type: types[i % types.length]!,
    text: `Block ${i} text content here`,
    marks: [],
    attrs: {},
  }));
}

function getXmlTextNode(fragment: Y.XmlFragment, blockIndex: number): Y.XmlText | null {
  const el = fragment.get(blockIndex);
  if (el instanceof Y.XmlElement) {
    const firstChild = el.get(0);
    if (firstChild instanceof Y.XmlText) return firstChild;
  }
  return null;
}

describe("createScriptYDoc", () => {
  it("creates Y.Doc with content fragment and meta map", () => {
    const syd = createScriptYDoc({ scriptId: "test-1" });
    expect(syd.ydoc.guid).toBe("test-1");
    expect(syd.contentFragment).toBeInstanceOf(Y.XmlFragment);
    expect(syd.meta).toBeInstanceOf(Y.Map);
    expect(syd.contentUndoManager).toBeInstanceOf(Y.UndoManager);
    expect(syd.metaUndoManager).toBeInstanceOf(Y.UndoManager);
    syd.destroy();
  });
});

describe("initContentFromPmDoc", () => {
  it("populates Y.XmlFragment from ProseMirror doc", () => {
    const blocks = makeBlocks(5);
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: "test-init" });

    initContentFromPmDoc(syd, pmDoc);

    expect(syd.contentFragment.length).toBe(5);

    const { doc } = initProseMirrorDoc(syd.contentFragment, screenplaySchema);
    const roundTripped = toBlocks(doc);
    expect(roundTripped).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(roundTripped[i]!.type).toBe(blocks[i]!.type);
      expect(roundTripped[i]!.text).toBe(blocks[i]!.text);
    }

    syd.destroy();
  });
});

describe("yjsPlugins", () => {
  it("returns sync, undo, and keymap plugins", () => {
    const syd = createScriptYDoc({ scriptId: "test-plugins" });
    const plugins = yjsPlugins(syd);
    expect(plugins).toHaveLength(3);
    syd.destroy();
  });
});

describe("meta operations", () => {
  it("title page fields round-trip through Y.Map", () => {
    const syd = createScriptYDoc({ scriptId: "test-meta" });
    const fields = {
      title: "My Screenplay",
      credit: "written by",
      author: "Jane Doe",
      source: "",
      draftDate: "July 2026",
      contact: "jane@example.com",
      copyright: "2026",
      notes: "Draft notes",
      revision: "First Draft",
    };

    setTitlePageFields(syd.meta, fields);
    const result = getTitlePageFields(syd.meta);
    expect(result).toEqual(fields);

    syd.destroy();
  });

  it("format profile name round-trips", () => {
    const syd = createScriptYDoc({ scriptId: "test-format" });
    setFormatProfileName(syd.meta, "us_feature");
    expect(getFormatProfileName(syd.meta)).toBe("us_feature");
    syd.destroy();
  });

  it("observeMeta fires on changes", () => {
    const syd = createScriptYDoc({ scriptId: "test-observe" });
    const observed: string[][] = [];
    const unobserve = observeMeta(syd.meta, (keys) => observed.push(keys));

    setMeta(syd.meta, "foo", "bar");
    expect(observed).toHaveLength(1);
    expect(observed[0]).toContain("foo");

    unobserve();
    setMeta(syd.meta, "baz", 42);
    expect(observed).toHaveLength(1);

    syd.destroy();
  });

  it("getMeta returns stored values", () => {
    const syd = createScriptYDoc({ scriptId: "test-get" });
    setMeta(syd.meta, "key1", "value1");
    expect(getMeta(syd.meta, "key1")).toBe("value1");
    expect(getMeta(syd.meta, "missing")).toBeUndefined();
    syd.destroy();
  });
});

describe("content undo/redo via Yjs operations", () => {
  it("undo reverses a text insert", () => {
    const blocks = makeBlocks(2);
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, pmDoc);

    const textNode = getXmlTextNode(syd.contentFragment, 0);
    expect(textNode).not.toBeNull();

    const originalText = textNode!.toString();

    textNode!.insert(0, "INSERTED ");

    expect(textNode!.toString()).toContain("INSERTED");

    syd.contentUndoManager.undo();
    expect(textNode!.toString()).toBe(originalText);

    syd.contentUndoManager.redo();
    expect(textNode!.toString()).toContain("INSERTED");

    syd.destroy();
  });

  it("undo survives element-type conversion (node replace)", () => {
    const blocks: Block[] = [
      { id: crypto.randomUUID(), type: "action", text: "Some action text", marks: [], attrs: {} },
      { id: crypto.randomUUID(), type: "action", text: "More text", marks: [], attrs: {} },
    ];
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, pmDoc);

    const textNode = getXmlTextNode(syd.contentFragment, 0);
    textNode!.insert(0, "before conversion ");

    syd.ydoc.transact(() => {
      const oldEl = syd.contentFragment.get(0) as Y.XmlElement;
      const oldText = getXmlTextNode(syd.contentFragment, 0)!.toString();
      const newEl = new Y.XmlElement("dialogue");
      const attrs = oldEl.getAttributes() as Record<string, string>;
      for (const [k, v] of Object.entries(attrs)) {
        newEl.setAttribute(k, v);
      }
      syd.contentFragment.delete(0, 1);
      syd.contentFragment.insert(0, [newEl]);
      const newText = newEl.get(0);
      if (newText instanceof Y.XmlText) {
        newText.insert(0, oldText);
      } else {
        const t = new Y.XmlText(oldText);
        newEl.insert(0, [t]);
      }
    });

    const convertedEl = syd.contentFragment.get(0) as Y.XmlElement;
    expect(convertedEl.nodeName).toBe("dialogue");
    expect(getXmlTextNode(syd.contentFragment, 0)!.toString()).toContain("before conversion");

    syd.contentUndoManager.undo();

    const restoredEl = syd.contentFragment.get(0) as Y.XmlElement;
    expect(restoredEl.nodeName).toBe("action");

    syd.contentUndoManager.undo();
    const originalTextNode = getXmlTextNode(syd.contentFragment, 0);
    expect(originalTextNode!.toString()).not.toContain("before conversion");

    syd.contentUndoManager.redo();
    syd.contentUndoManager.redo();
    const finalEl = syd.contentFragment.get(0) as Y.XmlElement;
    expect(finalEl.nodeName).toBe("dialogue");

    syd.destroy();
  });

  it("1,000 random edits with undo/redo converge (property)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            blockIdx: fc.nat({ max: 4 }),
            pos: fc.nat({ max: 100 }),
            text: fc.stringOf(fc.char(), { minLength: 1, maxLength: 5 }),
          }),
          { minLength: 100, maxLength: 1000 },
        ),
        fc.integer({ min: 1, max: 50 }),
        (edits, undoCount) => {
          const blocks = makeBlocks(5);
          const pmDoc = toPmDoc(blocks);
          const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
          initContentFromPmDoc(syd, pmDoc);

          for (const edit of edits) {
            const blockIdx = edit.blockIdx % syd.contentFragment.length;
            const textNode = getXmlTextNode(syd.contentFragment, blockIdx);
            if (!textNode) continue;

            const len = textNode.length;
            const insertPos = Math.min(edit.pos, len);
            textNode.insert(insertPos, edit.text);
          }

          const snapshot: string[] = [];
          for (let i = 0; i < syd.contentFragment.length; i++) {
            const t = getXmlTextNode(syd.contentFragment, i);
            snapshot.push(t?.toString() ?? "");
          }

          const actualUndos = Math.min(undoCount, syd.contentUndoManager.undoStack.length);
          for (let i = 0; i < actualUndos; i++) {
            syd.contentUndoManager.undo();
          }

          for (let i = 0; i < actualUndos; i++) {
            syd.contentUndoManager.redo();
          }

          for (let i = 0; i < syd.contentFragment.length; i++) {
            const t = getXmlTextNode(syd.contentFragment, i);
            expect(t?.toString() ?? "").toBe(snapshot[i]);
          }

          syd.destroy();
        },
      ),
      { numRuns: 10, seed: 42 },
    );
  });
});

describe("meta undo/redo (independent of content)", () => {
  it("meta undo does not affect content", () => {
    const blocks = makeBlocks(3);
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, pmDoc);

    const textNode = getXmlTextNode(syd.contentFragment, 0);
    textNode!.insert(0, "CONTENT EDIT ");
    const contentAfterEdit = textNode!.toString();

    setTitlePageFields(syd.meta, {
      title: "My Film",
      credit: "",
      author: "Author",
      source: "",
      draftDate: "",
      contact: "",
      copyright: "",
      notes: "",
      revision: "",
    });

    expect(getTitlePageFields(syd.meta).title).toBe("My Film");

    syd.metaUndoManager.undo();
    expect(getTitlePageFields(syd.meta).title).toBe("");

    expect(textNode!.toString()).toBe(contentAfterEdit);

    syd.metaUndoManager.redo();
    expect(getTitlePageFields(syd.meta).title).toBe("My Film");

    syd.destroy();
  });

  it("content undo does not affect meta", () => {
    const blocks = makeBlocks(2);
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: crypto.randomUUID() });
    initContentFromPmDoc(syd, pmDoc);

    setFormatProfileName(syd.meta, "us_feature");

    const textNode = getXmlTextNode(syd.contentFragment, 0);
    textNode!.insert(0, "edit ");

    syd.contentUndoManager.undo();

    expect(getFormatProfileName(syd.meta)).toBe("us_feature");

    syd.destroy();
  });
});

describe("Y.Doc state encoding/decoding", () => {
  it("state vector round-trips through encode/apply", () => {
    const blocks = makeBlocks(4);
    const pmDoc = toPmDoc(blocks);
    const syd = createScriptYDoc({ scriptId: "test-encode" });
    initContentFromPmDoc(syd, pmDoc);
    setTitlePageFields(syd.meta, {
      title: "Test Script",
      credit: "by",
      author: "Author",
      source: "",
      draftDate: "",
      contact: "",
      copyright: "",
      notes: "",
      revision: "",
    });

    const stateVector = Y.encodeStateAsUpdate(syd.ydoc);

    const syd2 = createScriptYDoc({ scriptId: "test-encode-2" });
    Y.applyUpdate(syd2.ydoc, stateVector);

    const { doc } = initProseMirrorDoc(syd2.contentFragment, screenplaySchema);
    const roundTripped = toBlocks(doc);
    expect(roundTripped).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(roundTripped[i]!.type).toBe(blocks[i]!.type);
      expect(roundTripped[i]!.text).toBe(blocks[i]!.text);
    }

    expect(getTitlePageFields(syd2.meta).title).toBe("Test Script");
    expect(getTitlePageFields(syd2.meta).author).toBe("Author");

    syd.destroy();
    syd2.destroy();
  });
});
