import { describe, expect, it } from "vitest";
import { EDITOR_PACKAGE_VERSION, SUPPORTED_BLOCK_TYPES, normalizeForEditor } from "./index.js";

describe("editor package boundary", () => {
  it("resolves the screenplay-core dependency across the workspace", () => {
    expect(EDITOR_PACKAGE_VERSION).toBe("0.0.0");
    expect(SUPPORTED_BLOCK_TYPES).toContain("scene_heading");
  });

  it("delegates normalization to screenplay-core", () => {
    const result = normalizeForEditor({ blocks: [] });
    expect(result).toEqual({ blocks: [] });
  });
});
