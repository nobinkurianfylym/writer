import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { findInBlocks, listSceneHeadings } from "./find-navigate.js";

function block(type: Block["type"], text: string, attrs: Record<string, unknown> = {}): Block {
  return { id: crypto.randomUUID(), type, text, marks: [], attrs };
}

describe("findInBlocks", () => {
  const doc: Block[] = [
    block("scene_heading", "INT. COFFEE SHOP - DAY"),
    block("action", "A busy coffee shop. Customers line up."),
    block("character", "MAYA"),
    block("dialogue", "I need more coffee."),
    block("scene_heading", "EXT. PARK - NIGHT"),
    block("action", "The park is quiet and still."),
    block("character", "JAKE"),
    block("dialogue", "The coffee here is terrible."),
  ];

  it("finds all case-insensitive matches", () => {
    const matches = findInBlocks(doc, "coffee");
    expect(matches).toHaveLength(4);
    expect(matches[0]!.blockIndex).toBe(0);
    expect(matches[1]!.blockIndex).toBe(1);
    expect(matches[2]!.blockIndex).toBe(3);
    expect(matches[3]!.blockIndex).toBe(7);
  });

  it("returns correct char ranges", () => {
    const matches = findInBlocks(doc, "MAYA");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ blockIndex: 2, charStart: 0, charEnd: 4, blockType: "character" });
  });

  it("filters by element type", () => {
    const matches = findInBlocks(doc, "coffee", "dialogue");
    expect(matches).toHaveLength(2);
    expect(matches[0]!.blockIndex).toBe(3);
    expect(matches[1]!.blockIndex).toBe(7);
  });

  it("filters to scene headings only", () => {
    const matches = findInBlocks(doc, "INT", "scene_heading");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.blockIndex).toBe(0);
  });

  it("returns empty for no query", () => {
    expect(findInBlocks(doc, "")).toHaveLength(0);
  });

  it("returns empty for no matches", () => {
    expect(findInBlocks(doc, "zzzzz")).toHaveLength(0);
  });

  it("finds multiple matches within one block", () => {
    const blocks = [block("action", "go go go")];
    const matches = findInBlocks(blocks, "go");
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.charStart)).toEqual([0, 3, 6]);
  });

  it("performs within 50ms on a 300-page document", () => {
    const largeBlocks: Block[] = [];
    for (let i = 0; i < 3300; i++) {
      const type = i % 4 === 0 ? "scene_heading" : i % 4 === 1 ? "action" : i % 4 === 2 ? "character" : "dialogue";
      largeBlocks.push(block(type as Block["type"], `This is block number ${i} with some text content for searching purposes.`));
    }
    const start = performance.now();
    const matches = findInBlocks(largeBlocks, "block number 1000");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("listSceneHeadings", () => {
  const doc: Block[] = [
    block("scene_heading", "INT. COFFEE SHOP - DAY"),
    block("action", "Busy morning."),
    block("character", "MAYA"),
    block("dialogue", "Hello."),
    block("scene_heading", "EXT. PARK - NIGHT"),
    block("action", "Quiet park."),
    block("scene_heading", "INT. OFFICE - DAY", { sceneNumber: "3" }),
  ];

  it("lists all scene headings with block indices", () => {
    const scenes = listSceneHeadings(doc);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toMatchObject({ blockIndex: 0, text: "INT. COFFEE SHOP - DAY" });
    expect(scenes[1]).toMatchObject({ blockIndex: 4, text: "EXT. PARK - NIGHT" });
    expect(scenes[2]).toMatchObject({ blockIndex: 6, text: "INT. OFFICE - DAY", sceneNumber: "3" });
  });

  it("returns empty for no scene headings", () => {
    const blocks = [block("action", "text"), block("dialogue", "speech")];
    expect(listSceneHeadings(blocks)).toHaveLength(0);
  });
});
