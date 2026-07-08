import { describe, expect, it } from "vitest";
import { screenplaySchema, toBlocks, toPmDoc } from "./index.js";

describe("editor package exports", () => {
  it("exposes the screenplay schema and both converters", () => {
    expect(screenplaySchema.nodes.scene_heading).toBeDefined();
    expect(typeof toPmDoc).toBe("function");
    expect(typeof toBlocks).toBe("function");
  });
});
