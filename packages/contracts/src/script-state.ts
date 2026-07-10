import { z } from "zod";
import { registry } from "./registry.js";
import { cursorPageResponseSchema } from "./pagination.js";

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export const CompressionSchema = registry.register(
  "Compression",
  z.enum(["zstd", "none"]).openapi("Compression"),
);

export type Compression = z.infer<typeof CompressionSchema>;

export const PutScriptStateSchema = registry.register(
  "PutScriptState",
  z
    .object({
      ydocState: z.string().min(1).regex(BASE64_PATTERN, "must be base64"),
      ydocVector: z
        .string()
        .regex(BASE64_PATTERN, "must be base64")
        .optional(),
      compression: CompressionSchema.default("none"),
    })
    .openapi("PutScriptState"),
);

export type PutScriptState = z.infer<typeof PutScriptStateSchema>;

export const ScriptStateSchema = registry.register(
  "ScriptState",
  z
    .object({
      scriptId: z.string().uuid(),
      ydocState: z.string().min(1),
      ydocVector: z.string().nullable(),
      compression: CompressionSchema,
      updatedAt: z.string().datetime(),
    })
    .openapi("ScriptState"),
);

export type ScriptState = z.infer<typeof ScriptStateSchema>;

export const SnapshotKindSchema = registry.register(
  "SnapshotKind",
  z.enum(["AUTO", "MANUAL", "REVISION", "LOCKED"]).openapi("SnapshotKind"),
);

export type SnapshotKind = z.infer<typeof SnapshotKindSchema>;

export const SnapshotSchema = registry.register(
  "Snapshot",
  z
    .object({
      id: z.string().uuid(),
      scriptId: z.string().uuid(),
      label: z.string().max(200).nullable(),
      kind: SnapshotKindSchema,
      createdById: z.string().uuid(),
      createdAt: z.string().datetime(),
    })
    .openapi("Snapshot"),
);

export type Snapshot = z.infer<typeof SnapshotSchema>;

export const CreateSnapshotSchema = registry.register(
  "CreateSnapshot",
  z
    .object({
      label: z.string().min(1).max(200).optional(),
    })
    .openapi("CreateSnapshot"),
);

export type CreateSnapshot = z.infer<typeof CreateSnapshotSchema>;

export const SnapshotPageSchema = registry.register(
  "SnapshotPage",
  cursorPageResponseSchema(SnapshotSchema).openapi("SnapshotPage"),
);

export type SnapshotPage = z.infer<typeof SnapshotPageSchema>;
