import { describe, expect, it } from "vitest";
import {
  EXPLICIT_SWITCH_ORDER,
  autoCapsPlugin,
  backspaceMergeCommand,
  elementBehaviorPlugins,
  screenplaySchema,
  smartTypeRules,
  switchElementCommand,
  toBlocks,
  toPmDoc,
  transitionCommand,
} from "./index.js";

describe("editor package exports", () => {
  it("exposes the schema and converters", () => {
    expect(screenplaySchema.nodes.scene_heading).toBeDefined();
    expect(typeof toPmDoc).toBe("function");
    expect(typeof toBlocks).toBe("function");
  });

  it("exposes the E2-2 element-behavior surface", () => {
    expect(typeof transitionCommand).toBe("function");
    expect(typeof backspaceMergeCommand).toBe("function");
    expect(typeof switchElementCommand).toBe("function");
    expect(EXPLICIT_SWITCH_ORDER.length).toBeGreaterThan(0);
    expect(typeof autoCapsPlugin).toBe("function");
    expect(smartTypeRules.length).toBeGreaterThan(0);
    expect(typeof elementBehaviorPlugins).toBe("function");
  });
});
