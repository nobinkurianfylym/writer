import { describe, expect, it } from "vitest";
import { SCREENPLAY_CORE_VERSION } from "./index.js";

describe("screenplay-core package boundary", () => {
  it("exports a version", () => {
    expect(SCREENPLAY_CORE_VERSION).toBe("0.0.0");
  });
});
