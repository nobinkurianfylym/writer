import { describe, expect, it } from "vitest";
import { ErrorEnvelopeSchema, CursorPageParamsSchema, ProjectSchema } from "./index.js";

describe("contracts schemas", () => {
  it("validates a well-formed error envelope", () => {
    const result = ErrorEnvelopeSchema.safeParse({
      error: { code: "NOT_FOUND", message: "Project not found" },
    });
    expect(result.success).toBe(true);
  });

  it("defaults the cursor page limit", () => {
    const result = CursorPageParamsSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("rejects an invalid project id", () => {
    const result = ProjectSchema.safeParse({
      id: "not-a-uuid",
      name: "Demo",
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
