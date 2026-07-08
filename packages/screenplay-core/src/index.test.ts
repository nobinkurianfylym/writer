import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, MARK_KINDS, normalize, isValid } from "./index.js";

describe("screenplay-core package boundary", () => {
  it("exports all 15 block types", () => {
    expect(BLOCK_TYPES).toHaveLength(15);
  });

  it("exports the 5 mark kinds", () => {
    expect(MARK_KINDS).toEqual(["bold", "italic", "underline", "strike", "revision"]);
  });

  it("exports a working normalize/isValid pair", () => {
    const doc = { blocks: [] };
    expect(isValid(normalize(doc))).toBe(true);
  });
});
