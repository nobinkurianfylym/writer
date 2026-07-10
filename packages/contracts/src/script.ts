import { z } from "zod";
import { registry } from "./registry.js";
import { cursorPageResponseSchema } from "./pagination.js";

export const ScriptSchema = registry.register(
  "Script",
  z
    .object({
      id: z.string().uuid().openapi({ example: "0195e9a4-7c1b-7000-8000-000000000002" }),
      projectId: z.string().uuid(),
      title: z.string().min(1).max(200),
      formatProfile: z.string().min(1).max(100),
      revisionColor: z.string().max(50).nullable(),
      pagesLocked: z.boolean(),
      deletedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .openapi("Script"),
);

export type Script = z.infer<typeof ScriptSchema>;

export const CreateScriptSchema = registry.register(
  "CreateScript",
  z
    .object({
      title: z.string().min(1).max(200),
      formatProfile: z.string().min(1).max(100).default("us-feature"),
    })
    .openapi("CreateScript"),
);

export type CreateScript = z.infer<typeof CreateScriptSchema>;

export const PatchScriptSchema = registry.register(
  "PatchScript",
  z
    .object({
      title: z.string().min(1).max(200).optional(),
    })
    .openapi("PatchScript"),
);

export type PatchScript = z.infer<typeof PatchScriptSchema>;

export const ScriptPageSchema = registry.register(
  "ScriptPage",
  cursorPageResponseSchema(ScriptSchema).openapi("ScriptPage"),
);

export type ScriptPage = z.infer<typeof ScriptPageSchema>;
