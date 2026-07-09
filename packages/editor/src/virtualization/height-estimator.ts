import type { BlockType } from "@fylym/screenplay-core";

const BASE_LINE_HEIGHT = 18;
const CHARS_PER_LINE = 60;

const VERTICAL_PADDING: Partial<Record<BlockType, number>> = {
  scene_heading: 24,
  action: 12,
  character: 20,
  dialogue: 4,
  parenthetical: 4,
  transition: 18,
  shot: 12,
};

export function estimateBlockHeight(type: BlockType, textLength: number): number {
  const padding = VERTICAL_PADDING[type] ?? 12;
  const lines = Math.max(1, Math.ceil(textLength / CHARS_PER_LINE));
  return lines * BASE_LINE_HEIGHT + padding;
}

export class HeightCache {
  private estimated: Float64Array;
  private measured: Float64Array;
  private hasMeasured: Uint8Array;
  private _prefixDirty = true;
  private _prefix: Float64Array;

  constructor(types: BlockType[], textLengths: number[]) {
    const n = types.length;
    this.estimated = new Float64Array(n);
    this.measured = new Float64Array(n);
    this.hasMeasured = new Uint8Array(n);
    this._prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      this.estimated[i] = estimateBlockHeight(types[i]!, textLengths[i]!);
    }
    this.rebuildPrefix();
  }

  get length(): number {
    return this.estimated.length;
  }

  heightAt(index: number): number {
    return this.hasMeasured[index] ? this.measured[index]! : this.estimated[index]!;
  }

  setMeasured(index: number, height: number): void {
    if (this.hasMeasured[index] && Math.abs(this.measured[index]! - height) < 0.5) return;
    this.measured[index] = height;
    this.hasMeasured[index] = 1;
    this._prefixDirty = true;
  }

  totalHeight(): number {
    if (this._prefixDirty) this.rebuildPrefix();
    return this._prefix[this.estimated.length]!;
  }

  offsetBefore(index: number): number {
    if (this._prefixDirty) this.rebuildPrefix();
    return this._prefix[index]!;
  }

  offsetAfter(endIndex: number): number {
    return this.totalHeight() - this.offsetBefore(endIndex);
  }

  findIndexAtOffset(offset: number): number {
    if (this._prefixDirty) this.rebuildPrefix();
    let lo = 0;
    let hi = this.estimated.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._prefix[mid + 1]! <= offset) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, this.estimated.length - 1);
  }

  splice(index: number, deleteCount: number, newTypes: BlockType[], newTextLengths: number[]): void {
    const n = this.estimated.length - deleteCount + newTypes.length;
    const est = new Float64Array(n);
    const meas = new Float64Array(n);
    const has = new Uint8Array(n);

    est.set(this.estimated.subarray(0, index));
    meas.set(this.measured.subarray(0, index));
    has.set(this.hasMeasured.subarray(0, index));

    for (let i = 0; i < newTypes.length; i++) {
      est[index + i] = estimateBlockHeight(newTypes[i]!, newTextLengths[i]!);
    }

    const tail = index + deleteCount;
    est.set(this.estimated.subarray(tail), index + newTypes.length);
    meas.set(this.measured.subarray(tail), index + newTypes.length);
    has.set(this.hasMeasured.subarray(tail), index + newTypes.length);

    this.estimated = est;
    this.measured = meas;
    this.hasMeasured = has;
    this._prefix = new Float64Array(n + 1);
    this._prefixDirty = true;
  }

  private rebuildPrefix(): void {
    const n = this.estimated.length;
    if (this._prefix.length !== n + 1) this._prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      this._prefix[i + 1] = this._prefix[i]! + this.heightAt(i);
    }
    this._prefixDirty = false;
  }
}
