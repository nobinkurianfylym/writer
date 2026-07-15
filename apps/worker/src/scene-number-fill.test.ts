import { describe, it, expect } from "vitest";
import type { ScreenplayDocument } from "@fylym/screenplay-core";
import { withAutoSceneNumbers } from "./export.js";

describe("withAutoSceneNumbers", () => {
  it("fills missing scene numbers with ordinals; overrides win", () => {
    const doc: ScreenplayDocument = { blocks: [
      { id: "1", type: "scene_heading", text: "INT. A - DAY", marks: [], attrs: {} },
      { id: "2", type: "action", text: "x", marks: [], attrs: {} },
      { id: "3", type: "scene_heading", text: "EXT. B - DAY", marks: [], attrs: { sceneNumber: "2A" } },
      { id: "4", type: "scene_heading", text: "INT. C - DAY", marks: [], attrs: {} },
    ]};
    const out = withAutoSceneNumbers(doc);
    expect(out.blocks.map((b) => b.attrs.sceneNumber)).toEqual(["1", undefined, "2A", "3"]);
  });
});
