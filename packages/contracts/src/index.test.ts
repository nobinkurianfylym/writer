import { describe, expect, it } from "vitest";
import {
  ErrorEnvelopeSchema,
  CursorPageParamsSchema,
  ProjectSchema,
  CreateProjectSchema,
  PatchProjectSchema,
  ScriptSchema,
  CreateScriptSchema,
  PatchScriptSchema,
  registry,
} from "./index.js";

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

  it("validates a well-formed project", () => {
    const result = ProjectSchema.safeParse({
      id: "0195e9a4-7c1b-7000-8000-000000000001",
      orgId: "0195e9a4-7c1b-7000-8000-000000000002",
      title: "Demo Feature",
      logline: null,
      genre: ["drama"],
      format: "FEATURE",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid project id", () => {
    const result = ProjectSchema.safeParse({
      id: "not-a-uuid",
      orgId: "0195e9a4-7c1b-7000-8000-000000000002",
      title: "Demo",
      logline: null,
      genre: [],
      format: "FEATURE",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("CreateProject requires title and format", () => {
    expect(CreateProjectSchema.safeParse({}).success).toBe(false);
    expect(
      CreateProjectSchema.safeParse({ title: "X", format: "FEATURE" }).success,
    ).toBe(true);
  });

  it("CreateProject defaults genre to empty array", () => {
    const parsed = CreateProjectSchema.parse({ title: "X", format: "FEATURE" });
    expect(parsed.genre).toEqual([]);
  });

  it("PatchProject accepts partial updates", () => {
    expect(PatchProjectSchema.safeParse({}).success).toBe(true);
    expect(PatchProjectSchema.safeParse({ title: "New" }).success).toBe(true);
    expect(PatchProjectSchema.safeParse({ logline: null }).success).toBe(true);
  });

  it("validates a well-formed script", () => {
    const result = ScriptSchema.safeParse({
      id: "0195e9a4-7c1b-7000-8000-000000000003",
      projectId: "0195e9a4-7c1b-7000-8000-000000000001",
      title: "Draft 1",
      formatProfile: "us-feature",
      revisionColor: null,
      pagesLocked: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("CreateScript defaults formatProfile", () => {
    const parsed = CreateScriptSchema.parse({ title: "Draft" });
    expect(parsed.formatProfile).toBe("us-feature");
  });

  it("PatchScript rejects empty title", () => {
    expect(PatchScriptSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("registers all E4-5 endpoint paths in the OpenAPI registry", () => {
    const routes = registry.definitions
      .filter((d) => d.type === "route")
      .map((d) => (d.type === "route" ? `${d.route.method} ${d.route.path}` : ""));

    const expected = [
      "post /v1/orgs/{orgId}/projects",
      "get /v1/orgs/{orgId}/projects",
      "get /v1/projects/{projectId}",
      "patch /v1/projects/{projectId}",
      "delete /v1/projects/{projectId}",
      "post /v1/projects/{projectId}/restore",
      "post /v1/projects/{projectId}/scripts",
      "get /v1/projects/{projectId}/scripts",
      "get /v1/scripts/{scriptId}",
      "patch /v1/scripts/{scriptId}",
      "delete /v1/scripts/{scriptId}",
      "post /v1/scripts/{scriptId}/restore",
    ];

    for (const route of expected) {
      expect(routes).toContain(route);
    }
  });
});
