import { z } from "zod";
import { registry } from "./registry.js";
import { ErrorEnvelopeSchema } from "./envelope.js";
import {
  ProjectSchema,
  CreateProjectSchema,
  PatchProjectSchema,
  ProjectPageSchema,
} from "./project.js";
import {
  ScriptSchema,
  CreateScriptSchema,
  PatchScriptSchema,
  ScriptPageSchema,
} from "./script.js";
import {
  PutScriptStateSchema,
  ScriptStateSchema,
  SnapshotSchema,
  CreateSnapshotSchema,
  SnapshotPageSchema,
} from "./script-state.js";
import { JobSchema } from "./jobs.js";
import { CreateExportSchema, ExportAcceptedSchema } from "./export.js";
import { OrgListSchema } from "./org.js";

const UuidParam = (name: string) =>
  z.object({ [name]: z.string().uuid() });

const CursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const errorResponses = {
  401: {
    description: "Not authenticated",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  403: {
    description: "Insufficient permissions",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  },
} as const;

/* ── Orgs ── */

registry.registerPath({
  method: "get",
  path: "/v1/orgs",
  tags: ["orgs"],
  summary: "List the organizations the caller belongs to",
  responses: {
    200: {
      description: "The caller's organizations",
      content: { "application/json": { schema: OrgListSchema } },
    },
    ...errorResponses,
  },
});

/* ── Projects ── */

registry.registerPath({
  method: "post",
  path: "/v1/orgs/{orgId}/projects",
  tags: ["projects"],
  summary: "Create a project",
  request: {
    params: UuidParam("orgId"),
    body: {
      content: { "application/json": { schema: CreateProjectSchema } },
    },
  },
  responses: {
    201: {
      description: "Project created",
      content: { "application/json": { schema: ProjectSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/orgs/{orgId}/projects",
  tags: ["projects"],
  summary: "List projects (cursor-paginated, excludes trash)",
  request: {
    params: UuidParam("orgId"),
    query: CursorQuery.extend({
      trash: z.enum(["true", "false"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Page of projects",
      content: { "application/json": { schema: ProjectPageSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/projects/{projectId}",
  tags: ["projects"],
  summary: "Get a project",
  request: { params: UuidParam("projectId") },
  responses: {
    200: {
      description: "The project",
      content: { "application/json": { schema: ProjectSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/v1/projects/{projectId}",
  tags: ["projects"],
  summary: "Update a project",
  request: {
    params: UuidParam("projectId"),
    body: {
      content: { "application/json": { schema: PatchProjectSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated project",
      content: { "application/json": { schema: ProjectSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/v1/projects/{projectId}",
  tags: ["projects"],
  summary: "Move a project to trash (soft delete)",
  request: { params: UuidParam("projectId") },
  responses: {
    204: { description: "Project moved to trash" },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/projects/{projectId}/restore",
  tags: ["projects"],
  summary: "Restore a project from trash",
  request: { params: UuidParam("projectId") },
  responses: {
    200: {
      description: "Restored project",
      content: { "application/json": { schema: ProjectSchema } },
    },
    ...errorResponses,
  },
});

/* ── Scripts ── */

registry.registerPath({
  method: "post",
  path: "/v1/projects/{projectId}/scripts",
  tags: ["scripts"],
  summary: "Create a script in a project",
  request: {
    params: UuidParam("projectId"),
    body: {
      content: { "application/json": { schema: CreateScriptSchema } },
    },
  },
  responses: {
    201: {
      description: "Script created",
      content: { "application/json": { schema: ScriptSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/projects/{projectId}/scripts",
  tags: ["scripts"],
  summary: "List scripts in a project (cursor-paginated, excludes trash)",
  request: {
    params: UuidParam("projectId"),
    query: CursorQuery.extend({
      trash: z.enum(["true", "false"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Page of scripts",
      content: { "application/json": { schema: ScriptPageSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/scripts/{scriptId}",
  tags: ["scripts"],
  summary: "Get script metadata",
  request: { params: UuidParam("scriptId") },
  responses: {
    200: {
      description: "The script",
      content: { "application/json": { schema: ScriptSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/v1/scripts/{scriptId}",
  tags: ["scripts"],
  summary: "Rename a script",
  request: {
    params: UuidParam("scriptId"),
    body: {
      content: { "application/json": { schema: PatchScriptSchema } },
    },
  },
  responses: {
    200: {
      description: "Updated script",
      content: { "application/json": { schema: ScriptSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/v1/scripts/{scriptId}",
  tags: ["scripts"],
  summary: "Move a script to trash (soft delete)",
  request: { params: UuidParam("scriptId") },
  responses: {
    204: { description: "Script moved to trash" },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/scripts/{scriptId}/restore",
  tags: ["scripts"],
  summary: "Restore a script from trash",
  request: { params: UuidParam("scriptId") },
  responses: {
    200: {
      description: "Restored script",
      content: { "application/json": { schema: ScriptSchema } },
    },
    ...errorResponses,
  },
});

/* ── Script state ── */

registry.registerPath({
  method: "put",
  path: "/v1/scripts/{scriptId}/state",
  tags: ["script-state"],
  summary: "Upload the Yjs document state (optionally zstd-compressed)",
  request: {
    params: UuidParam("scriptId"),
    body: {
      content: { "application/json": { schema: PutScriptStateSchema } },
    },
  },
  responses: {
    200: {
      description: "State stored",
      content: {
        "application/json": {
          schema: z.object({ scriptId: z.string().uuid(), bytes: z.number().int() }),
        },
      },
    },
    413: {
      description: "State exceeds the plan's size ceiling",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/scripts/{scriptId}/state",
  tags: ["script-state"],
  summary: "Download the Yjs document state (zstd-compressed)",
  request: { params: UuidParam("scriptId") },
  responses: {
    200: {
      description: "Current state",
      content: { "application/json": { schema: ScriptStateSchema } },
    },
    ...errorResponses,
  },
});

/* ── Snapshots ── */

registry.registerPath({
  method: "post",
  path: "/v1/scripts/{scriptId}/snapshots",
  tags: ["snapshots"],
  summary: "Create a MANUAL snapshot of the current script state",
  request: {
    params: UuidParam("scriptId"),
    body: {
      content: { "application/json": { schema: CreateSnapshotSchema } },
    },
  },
  responses: {
    201: {
      description: "Snapshot created",
      content: { "application/json": { schema: SnapshotSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/scripts/{scriptId}/snapshots",
  tags: ["snapshots"],
  summary: "List snapshots (cursor-paginated, newest first)",
  request: {
    params: UuidParam("scriptId"),
    query: CursorQuery,
  },
  responses: {
    200: {
      description: "Page of snapshots",
      content: { "application/json": { schema: SnapshotPageSchema } },
    },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/scripts/{scriptId}/snapshots/{snapshotId}/restore",
  tags: ["snapshots"],
  summary: "Restore the script state from a snapshot",
  request: {
    params: z.object({
      scriptId: z.string().uuid(),
      snapshotId: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: "State restored from snapshot",
      content: { "application/json": { schema: SnapshotSchema } },
    },
    ...errorResponses,
  },
});

/* ── Exports ── */

registry.registerPath({
  method: "post",
  path: "/v1/scripts/{scriptId}/exports",
  tags: ["exports"],
  summary: "Request an async export (PDF/FDX/Fountain); returns a job id",
  request: {
    params: z.object({ scriptId: z.string().uuid() }),
    body: {
      content: { "application/json": { schema: CreateExportSchema } },
    },
  },
  responses: {
    202: {
      description: "Export accepted; poll GET /v1/jobs/:jobId",
      content: { "application/json": { schema: ExportAcceptedSchema } },
    },
    ...errorResponses,
  },
});

/* ── Jobs ── */

registry.registerPath({
  method: "get",
  path: "/v1/jobs/{jobId}",
  tags: ["jobs"],
  summary: "Poll an async job's status, progress, and result URL",
  request: {
    params: z.object({ jobId: z.string() }),
  },
  responses: {
    200: {
      description: "Job status",
      content: { "application/json": { schema: JobSchema } },
    },
    ...errorResponses,
  },
});
