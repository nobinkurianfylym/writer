import type { Block, BlockType } from "@fylym/screenplay-core";
import type { Node as PMNode } from "prosemirror-model";
import { HeightCache } from "./height-estimator.js";
import { toBlock, toPmNode } from "../converters.js";

export interface ViewportRange {
  start: number;
  end: number;
}

const OVERSCAN_PX = 800;
const MIN_WINDOW = 40;

export class VirtualViewport {
  readonly blocks: Block[];
  readonly heights: HeightCache;
  private nodeCache = new Map<string, PMNode>();
  range: ViewportRange = { start: 0, end: 0 };

  constructor(blocks: Block[]) {
    this.blocks = blocks;
    this.heights = new HeightCache(
      blocks.map((b) => b.type),
      blocks.map((b) => b.text.length),
    );
  }

  get totalHeight(): number {
    return this.heights.totalHeight();
  }

  computeRange(scrollTop: number, viewportHeight: number): ViewportRange {
    if (this.blocks.length === 0) return { start: 0, end: 0 };
    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    const bottom = scrollTop + viewportHeight + OVERSCAN_PX;
    const start = this.heights.findIndexAtOffset(top);
    let end = this.heights.findIndexAtOffset(bottom) + 1;
    end = Math.min(end, this.blocks.length);
    if (end - start < MIN_WINDOW) {
      end = Math.min(start + MIN_WINDOW, this.blocks.length);
    }
    return { start, end };
  }

  getNode(blockIndex: number): PMNode {
    const block = this.blocks[blockIndex]!;
    let node = this.nodeCache.get(block.id);
    if (!node) {
      node = toPmNode(block);
      this.nodeCache.set(block.id, node);
    }
    return node;
  }

  setNode(blockId: string, node: PMNode): void {
    this.nodeCache.set(blockId, node);
  }

  invalidateNode(blockId: string): void {
    this.nodeCache.delete(blockId);
  }

  syncEdits(oldDoc: PMNode, newDoc: PMNode): void {
    const oldCount = oldDoc.childCount;
    const newCount = newDoc.childCount;
    const { start: rangeStart } = this.range;

    let changeStart = 0;
    while (changeStart < Math.min(oldCount, newCount) && oldDoc.child(changeStart) === newDoc.child(changeStart)) {
      changeStart++;
    }
    if (changeStart === oldCount && changeStart === newCount) return;

    let oldEnd = oldCount;
    let newEnd = newCount;
    while (oldEnd > changeStart && newEnd > changeStart && oldDoc.child(oldEnd - 1) === newDoc.child(newEnd - 1)) {
      oldEnd--;
      newEnd--;
    }

    const globalStart = rangeStart + changeStart;
    const deleteCount = oldEnd - changeStart;
    const newBlocks: Block[] = [];
    const newTypes: BlockType[] = [];
    const newLengths: number[] = [];

    for (let i = changeStart; i < newEnd; i++) {
      const node = newDoc.child(i);
      const block = toBlock(node);
      newBlocks.push(block);
      newTypes.push(block.type);
      newLengths.push(block.text.length);
      this.nodeCache.set(block.id, node);
    }

    for (let i = changeStart; i < changeStart + deleteCount; i++) {
      const oldBlock = this.blocks[rangeStart + i];
      if (oldBlock) this.nodeCache.delete(oldBlock.id);
    }

    this.blocks.splice(globalStart, deleteCount, ...newBlocks);
    this.heights.splice(globalStart, deleteCount, newTypes, newLengths);
    this.range = { start: this.range.start, end: this.range.start + newDoc.childCount };
  }

  measureVisible(pmDom: HTMLElement): void {
    const children = pmDom.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (!child.getBoundingClientRect) continue;
      const height = child.getBoundingClientRect().height;
      if (height > 0) {
        this.heights.setMeasured(this.range.start + i, height);
      }
    }
  }
}
