import { describe, expect, it } from "vitest";
import { HeightCache, estimateBlockHeight } from "./height-estimator.js";

describe("estimateBlockHeight", () => {
  it("returns a positive height for any block type", () => {
    expect(estimateBlockHeight("action", 0)).toBeGreaterThan(0);
    expect(estimateBlockHeight("scene_heading", 100)).toBeGreaterThan(0);
    expect(estimateBlockHeight("dialogue", 50)).toBeGreaterThan(0);
  });

  it("increases with text length", () => {
    const short = estimateBlockHeight("action", 10);
    const long = estimateBlockHeight("action", 300);
    expect(long).toBeGreaterThan(short);
  });
});

describe("HeightCache", () => {
  it("computes total height from estimates", () => {
    const cache = new HeightCache(["action", "dialogue", "scene_heading"], [20, 30, 25]);
    expect(cache.totalHeight()).toBeGreaterThan(0);
    expect(cache.length).toBe(3);
  });

  it("prefix sums are monotonically increasing", () => {
    const cache = new HeightCache(["action", "action", "action"], [10, 20, 30]);
    expect(cache.offsetBefore(0)).toBe(0);
    expect(cache.offsetBefore(1)).toBeGreaterThan(0);
    expect(cache.offsetBefore(2)).toBeGreaterThan(cache.offsetBefore(1));
    expect(cache.offsetBefore(3)).toBe(cache.totalHeight());
  });

  it("findIndexAtOffset binary search is correct", () => {
    const types = Array.from({ length: 100 }, () => "action" as const);
    const lengths = Array.from({ length: 100 }, () => 50);
    const cache = new HeightCache(types, lengths);

    expect(cache.findIndexAtOffset(0)).toBe(0);

    const midOffset = cache.offsetBefore(50);
    expect(cache.findIndexAtOffset(midOffset)).toBe(50);

    expect(cache.findIndexAtOffset(cache.totalHeight())).toBe(99);
  });

  it("setMeasured updates the height and recalculates prefix", () => {
    const cache = new HeightCache(["action", "action"], [10, 10]);
    const originalTotal = cache.totalHeight();

    cache.setMeasured(0, 100);
    expect(cache.heightAt(0)).toBe(100);
    expect(cache.totalHeight()).not.toBe(originalTotal);
  });

  it("splice inserts and removes correctly", () => {
    const cache = new HeightCache(["action", "dialogue", "action"], [10, 20, 30]);
    const h0 = cache.heightAt(0);
    const h2 = cache.heightAt(2);

    cache.splice(1, 1, ["scene_heading", "character"], [15, 10]);
    expect(cache.length).toBe(4);
    expect(cache.heightAt(0)).toBe(h0);
    expect(cache.heightAt(3)).toBe(h2);
  });

  it("offsetAfter returns remaining height", () => {
    const cache = new HeightCache(["action", "action", "action"], [10, 10, 10]);
    const total = cache.totalHeight();
    const before2 = cache.offsetBefore(2);
    expect(cache.offsetAfter(2)).toBe(total - before2);
  });
});
