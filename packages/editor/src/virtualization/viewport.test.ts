import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { toPmDoc } from "../converters.js";
import { VirtualViewport } from "./viewport.js";

function makeBlocks(count: number): Block[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `block-${i}`,
    type: "action" as const,
    text: `Line ${i} of the screenplay with enough text to estimate height.`,
    marks: [],
    attrs: {},
  }));
}

describe("VirtualViewport", () => {
  it("computes a visible range from scroll position", () => {
    const blocks = makeBlocks(1000);
    const vp = new VirtualViewport(blocks);
    const range = vp.computeRange(0, 600);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(0);
    expect(range.end).toBeLessThanOrEqual(1000);
  });

  it("returns the entire range for a small document", () => {
    const blocks = makeBlocks(5);
    const vp = new VirtualViewport(blocks);
    const range = vp.computeRange(0, 2000);
    expect(range.start).toBe(0);
    expect(range.end).toBe(5);
  });

  it("shifts range when scrolled down", () => {
    const blocks = makeBlocks(10000);
    const vp = new VirtualViewport(blocks);
    const midOffset = vp.heights.offsetBefore(5000);
    const range = vp.computeRange(midOffset, 600);
    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBeLessThan(10000);
    expect(range.start).toBeLessThanOrEqual(5000);
    expect(range.end).toBeGreaterThan(5000);
  });

  it("getNode caches ProseMirror nodes", () => {
    const blocks = makeBlocks(10);
    const vp = new VirtualViewport(blocks);
    const node1 = vp.getNode(0);
    const node2 = vp.getNode(0);
    expect(node1).toBe(node2);
  });

  it("syncEdits detects block text changes", () => {
    const blocks = makeBlocks(10);
    const vp = new VirtualViewport(blocks);
    vp.range = { start: 0, end: 10 };

    const oldDoc = toPmDoc(blocks);

    const editedBlocks = [...blocks];
    editedBlocks[3] = { ...editedBlocks[3]!, text: "EDITED TEXT" };
    const newDoc = toPmDoc(editedBlocks);

    vp.syncEdits(oldDoc, newDoc);
    expect(vp.blocks[3]!.text).toBe("EDITED TEXT");
  });

  it("syncEdits handles block splits", () => {
    const blocks = makeBlocks(5);
    const vp = new VirtualViewport(blocks);
    vp.range = { start: 0, end: 5 };

    const oldDoc = toPmDoc(blocks);

    const splitBlocks = [...blocks];
    const orig = splitBlocks[2]!;
    splitBlocks.splice(2, 1, { ...orig, text: "First half" }, { ...orig, id: "new-split", text: "Second half" });
    const newDoc = toPmDoc(splitBlocks);

    vp.syncEdits(oldDoc, newDoc);
    expect(vp.blocks.length).toBe(6);
    expect(vp.blocks[2]!.text).toBe("First half");
    expect(vp.blocks[3]!.text).toBe("Second half");
  });

  it("totalHeight returns sum of all block heights", () => {
    const blocks = makeBlocks(100);
    const vp = new VirtualViewport(blocks);
    expect(vp.totalHeight).toBeGreaterThan(0);
  });
});
