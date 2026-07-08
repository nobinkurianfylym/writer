import { describe, expect, it } from "vitest";
import { EDITOR_PACKAGE_VERSION, EDITOR_CORE_DEPENDENCY_VERSION } from "./index.js";

describe("editor package boundary", () => {
  it("resolves the screenplay-core dependency across the workspace", () => {
    expect(EDITOR_PACKAGE_VERSION).toBe("0.0.0");
    expect(EDITOR_CORE_DEPENDENCY_VERSION).toBe("0.0.0");
  });
});
