import { EditorState, TextSelection } from "prosemirror-state";
import { type Decoration, DecorationSet } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import { paginate, usFeatureProfile, type Block } from "@fylym/screenplay-core";
import { toPmDoc } from "../converters.js";
import { paginationKey, paginationPlugin } from "./plugin.js";

function makeBlocks(count: number): Block[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    type: "action" as const,
    text: "Character enters the room and carefully surveys the surroundings, taking in every detail with curiosity and wonder.",
    marks: [],
    attrs: {},
  }));
}

function makeWorkerStub(): Worker {
  return {
    postMessage() {},
    terminate() {},
    addEventListener() {},
    removeEventListener() {},
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    dispatchEvent: () => true,
  } as unknown as Worker;
}

describe("paginationPlugin state", () => {
  it("init returns empty decorations and null pageMap", () => {
    const blocks = makeBlocks(5);
    const doc = toPmDoc(blocks);
    const state = EditorState.create({
      doc,
      plugins: [paginationPlugin(makeWorkerStub())],
    });

    const ps = paginationKey.getState(state)!;
    expect(ps.pageMap).toBeNull();
    expect(ps.decorations).toBe(DecorationSet.empty);
    expect(ps.workerAlive).toBe(true);
  });

  it("apply with pageMap meta builds decorations for a multi-page doc", () => {
    const blocks = makeBlocks(200);
    const doc = toPmDoc(blocks);
    const state = EditorState.create({
      doc,
      plugins: [paginationPlugin(makeWorkerStub())],
    });

    const pageMap = paginate({ blocks }, usFeatureProfile);
    expect(pageMap.pages.length).toBeGreaterThan(1);

    const tr = state.tr.setMeta(paginationKey, { pageMap, seq: 1 });
    const next = state.apply(tr);
    const ps = paginationKey.getState(next)!;

    expect(ps.pageMap).toBe(pageMap);
    expect(ps.decorations).not.toBe(DecorationSet.empty);

    const found = ps.decorations.find(0, doc.content.size);
    expect(found.length).toBe(pageMap.pages.length - 1);
  });

  it("apply with workerDead meta sets workerAlive to false", () => {
    const blocks = makeBlocks(5);
    const doc = toPmDoc(blocks);
    const state = EditorState.create({
      doc,
      plugins: [paginationPlugin(makeWorkerStub())],
    });

    const tr = state.tr.setMeta(paginationKey, { workerDead: true });
    const next = state.apply(tr);
    const ps = paginationKey.getState(next)!;

    expect(ps.workerAlive).toBe(false);
  });

  it("apply on doc change maps existing decorations without rebuilding", () => {
    const blocks = makeBlocks(200);
    const doc = toPmDoc(blocks);
    const state = EditorState.create({
      doc,
      plugins: [paginationPlugin(makeWorkerStub())],
    });

    const pageMap = paginate({ blocks }, usFeatureProfile);
    const withMap = state.apply(state.tr.setMeta(paginationKey, { pageMap, seq: 1 }));
    const decsBefore = paginationKey.getState(withMap)!.decorations;

    const sel = TextSelection.create(withMap.doc, 2);
    const editTr = withMap.tr.setSelection(sel).insertText("x", 2);
    const edited = withMap.apply(editTr);
    const decsAfter = paginationKey.getState(edited)!.decorations;

    expect(decsAfter).not.toBe(decsBefore);
    const found = decsAfter.find(0, edited.doc.content.size);
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("decoration content", () => {
  it("each page-break widget has the correct page number in its key", () => {
    const blocks = makeBlocks(200);
    const doc = toPmDoc(blocks);
    const state = EditorState.create({
      doc,
      plugins: [paginationPlugin(makeWorkerStub())],
    });

    const pageMap = paginate({ blocks }, usFeatureProfile);
    const next = state.apply(state.tr.setMeta(paginationKey, { pageMap, seq: 1 }));
    const decorations = paginationKey.getState(next)!.decorations;
    const found = decorations.find(0, doc.content.size);

    for (let i = 0; i < found.length; i++) {
      const spec = (found[i] as Decoration & { spec: { key: string } }).spec;
      expect(spec.key).toBe(`page-break-${i + 2}`);
    }
  });
});
