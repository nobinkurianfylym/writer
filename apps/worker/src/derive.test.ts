import { describe, it, expect } from "vitest";
import { usFeatureProfile, type ScreenplayDocument } from "@fylym/screenplay-core";
import { deriveSceneIndex } from "./derive.js";

let seq = 0;
function id(): string {
  return `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
}
function block(type: string, text: string, attrs = {}) {
  return { id: id(), type: type as never, text, marks: [], attrs };
}

describe("deriveSceneIndex", () => {
  it("derives one row per scene with heading tokens", () => {
    const sceneA = block("scene_heading", "INT. HOUSE - DAY", { sceneNumber: "1" });
    const sceneB = block("scene_heading", "EXT. STREET - NIGHT");
    const doc: ScreenplayDocument = {
      blocks: [
        sceneA,
        block("action", "A quiet room with two chairs."),
        block("character", "ALEX"),
        block("dialogue", "Hello there."),
        sceneB,
        block("action", "Rain falls."),
      ],
    };

    const scenes = deriveSceneIndex(doc);
    expect(scenes).toHaveLength(2);

    expect(scenes[0]).toMatchObject({
      id: sceneA.id,
      position: 0,
      heading: "INT. HOUSE - DAY",
      intExt: "INT",
      timeOfDay: "DAY",
      sceneNumber: "1",
      characterIds: ["ALEX"],
    });
    expect(scenes[1]).toMatchObject({
      id: sceneB.id,
      position: 1,
      intExt: "EXT",
      timeOfDay: "NIGHT",
      sceneNumber: null,
    });
  });

  it("counts words across the whole scene body", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block("scene_heading", "INT. ROOM - DAY"), // 4 words
        block("action", "One two three."), // 3
        block("dialogue", "Four five."), // 2
      ],
    };
    // 4 + 3 + 2 = 9
    expect(deriveSceneIndex(doc)[0]!.wordCount).toBe(9);
  });

  it("collects distinct uppercased character cues", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block("scene_heading", "INT. BAR - NIGHT"),
        block("character", "sam"),
        block("dialogue", "Hi."),
        block("character", "JODIE"),
        block("dialogue", "Hey."),
        block("character", "Sam"),
        block("dialogue", "Again."),
      ],
    };
    expect(deriveSceneIndex(doc)[0]!.characterIds).toEqual(["SAM", "JODIE"]);
  });

  it("ignores preamble blocks before the first scene heading", () => {
    const doc: ScreenplayDocument = {
      blocks: [
        block("title_page", "Title: TEST"),
        block("scene_heading", "INT. ROOM - DAY"),
        block("action", "Body."),
      ],
    };
    const scenes = deriveSceneIndex(doc);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.position).toBe(0);
  });

  it("computes page spans when a profile is provided", () => {
    const blocks = [block("scene_heading", "INT. ROOM - DAY")];
    for (let i = 0; i < 200; i++) {
      blocks.push(block("action", "Filler line for pagination. ".repeat(4)));
    }
    blocks.push(block("scene_heading", "EXT. FIELD - DAY"));
    blocks.push(block("action", "Second scene."));

    const scenes = deriveSceneIndex({ blocks }, usFeatureProfile);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]!.pageStart).toBe(1);
    expect(scenes[0]!.pageEnd!).toBeGreaterThan(1);
    // Second scene starts at or after the first scene's last page.
    expect(scenes[1]!.pageStart!).toBeGreaterThanOrEqual(scenes[0]!.pageEnd!);
  });

  it("leaves page spans null without a profile", () => {
    const doc: ScreenplayDocument = {
      blocks: [block("scene_heading", "INT. ROOM - DAY")],
    };
    const scene = deriveSceneIndex(doc)[0]!;
    expect(scene.pageStart).toBeNull();
    expect(scene.pageEnd).toBeNull();
  });

  it("derives a 200-scene script in under 1 second", () => {
    const blocks = [];
    for (let i = 0; i < 200; i++) {
      blocks.push(block("scene_heading", `INT. LOCATION ${i} - DAY`, { sceneNumber: String(i + 1) }));
      blocks.push(block("action", "Something happens here in this scene."));
      blocks.push(block("character", `CHAR${i}`));
      blocks.push(block("dialogue", "A line of dialogue."));
    }

    const start = performance.now();
    const scenes = deriveSceneIndex({ blocks }, usFeatureProfile);
    const elapsed = performance.now() - start;

    expect(scenes).toHaveLength(200);
    expect(elapsed).toBeLessThan(1000);
  });
});
