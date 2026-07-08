import { describe, expect, it } from "vitest";
import type { Block, ScreenplayDocument } from "../model.js";
import { usFeatureProfile } from "../profiles/us-feature.js";
import { repaginate } from "./incremental.js";
import { paginate } from "./solver.js";

function block(overrides: Partial<Block>): Block {
  return { id: "id", type: "action", text: "", marks: [], attrs: {}, ...overrides };
}

function bigDoc(n: number, textLength = 30): ScreenplayDocument {
  const pattern = ["scene_heading", "action", "character", "dialogue", "action"] as const;
  return {
    blocks: Array.from({ length: n }, (_, i) => {
      const type = pattern[i % pattern.length]!;
      const text =
        type === "scene_heading"
          ? `INT. LOCATION ${i} - DAY`
          : type === "character"
            ? `CHARACTER${i % 7}`
            : `Content ${i} `.repeat(Math.ceil(textLength / 9)).slice(0, textLength);
      return block({ id: `b${i}`, type, text });
    }),
  };
}

describe("determinism audit: repeated calls", () => {
  it("paginate() is byte-identical (JSON-equal) across 20 repeated calls on the same document", () => {
    const doc = bigDoc(200);
    const first = JSON.stringify(paginate(doc, usFeatureProfile));
    for (let i = 0; i < 20; i++) {
      expect(JSON.stringify(paginate(doc, usFeatureProfile))).toBe(first);
    }
  });

  it("paginate() does not mutate its inputs across repeated calls", () => {
    const doc = bigDoc(50);
    const docSnapshot = JSON.parse(JSON.stringify(doc));
    const profileSnapshot = JSON.parse(JSON.stringify(usFeatureProfile));
    paginate(doc, usFeatureProfile);
    paginate(doc, usFeatureProfile);
    expect(doc).toEqual(docSnapshot);
    expect(usFeatureProfile).toEqual(profileSnapshot);
  });
});

describe("determinism audit: multi-step incremental chains", () => {
  it("chaining repaginate() off its own previous result matches a full paginate() at every step", () => {
    let doc = bigDoc(300);
    let pageMap = paginate(doc, usFeatureProfile);

    for (let step = 0; step < 15; step++) {
      const index = (step * 37) % doc.blocks.length;
      const target = doc.blocks[index]!;
      const newBlocks = [...doc.blocks];
      newBlocks[index] = { ...target, text: `${target.text} edited-${step}` };
      doc = { blocks: newBlocks };

      // Chain off the PREVIOUS incremental result, not a fresh full
      // recompute — this is how a real editor actually calls repaginate.
      pageMap = repaginate(doc, usFeatureProfile, pageMap, { fromBlockIndex: index });
      const full = paginate(doc, usFeatureProfile);
      expect(pageMap).toEqual(full);
    }
  });
});

describe("performance budgets (E1-5 accept criteria)", () => {
  it("full paginate() of a ~300-page document completes in well under 150ms", () => {
    const doc = bigDoc(7500); // pattern averages ~2.2 lines/block -> ~16,500 lines -> ~300 pages
    const pageMap = paginate(doc, usFeatureProfile);
    expect(pageMap.pages.length).toBeGreaterThanOrEqual(250);

    // Warm up the JIT, then take the minimum of several timed trials — a
    // standard way to filter out transient CPU contention (e.g. other
    // packages building/testing concurrently under turbo): contention can
    // only inflate a sample, never deflate it below the algorithm's true cost.
    for (let i = 0; i < 3; i++) paginate(doc, usFeatureProfile);
    let minElapsed = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      paginate(doc, usFeatureProfile);
      minElapsed = Math.min(minElapsed, Date.now() - start);
    }

    expect(minElapsed).toBeLessThan(150);
  });

  it("incremental repaginate() median time is well under 10ms on a ~300-page document", () => {
    const doc = bigDoc(7500);
    const prevPageMap = paginate(doc, usFeatureProfile);
    expect(prevPageMap.pages.length).toBeGreaterThanOrEqual(250);

    const trials = 25;
    const timings: number[] = [];
    for (let i = 0; i < trials; i++) {
      const index = doc.blocks.length - 10 - i; // edits near the end, worst case for a naive full rescan
      const target = doc.blocks[index]!;
      const newBlocks = [...doc.blocks];
      newBlocks[index] = { ...target, text: `${target.text} changed` };
      const editedDoc = { blocks: newBlocks };

      const start = Date.now();
      repaginate(editedDoc, usFeatureProfile, prevPageMap, { fromBlockIndex: index });
      timings.push(Date.now() - start);
    }

    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)]!;
    expect(median).toBeLessThan(10);
  });
});
