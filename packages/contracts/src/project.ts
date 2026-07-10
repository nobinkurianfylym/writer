import { z } from "zod";
import { registry } from "./registry.js";
import { cursorPageResponseSchema } from "./pagination.js";

export const ScriptFormatSchema = registry.register(
  "ScriptFormat",
  z
    .enum([
      "FEATURE",
      "TV_ONE_HOUR",
      "SITCOM",
      "STAGE_PLAY",
      "RADIO",
      "PODCAST",
      "ANIMATION",
      "GAME",
      "COMIC",
      "DOCUMENTARY",
      "COMMERCIAL",
      "AUDIO_DRAMA",
    ])
    .openapi("ScriptFormat"),
);

export type ScriptFormat = z.infer<typeof ScriptFormatSchema>;

export const ProjectSchema = registry.register(
  "Project",
  z
    .object({
      id: z.string().uuid().openapi({ example: "0195e9a4-7c1b-7000-8000-000000000001" }),
      orgId: z.string().uuid(),
      title: z.string().min(1).max(200),
      logline: z.string().max(1000).nullable(),
      genre: z.array(z.string().min(1).max(50)),
      format: ScriptFormatSchema,
      deletedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .openapi("Project"),
);

export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = registry.register(
  "CreateProject",
  z
    .object({
      title: z.string().min(1).max(200),
      logline: z.string().max(1000).optional(),
      genre: z.array(z.string().min(1).max(50)).max(10).default([]),
      format: ScriptFormatSchema,
    })
    .openapi("CreateProject"),
);

export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const PatchProjectSchema = registry.register(
  "PatchProject",
  z
    .object({
      title: z.string().min(1).max(200).optional(),
      logline: z.string().max(1000).nullable().optional(),
      genre: z.array(z.string().min(1).max(50)).max(10).optional(),
      format: ScriptFormatSchema.optional(),
    })
    .openapi("PatchProject"),
);

export type PatchProject = z.infer<typeof PatchProjectSchema>;

export const ProjectPageSchema = registry.register(
  "ProjectPage",
  cursorPageResponseSchema(ProjectSchema).openapi("ProjectPage"),
);

export type ProjectPage = z.infer<typeof ProjectPageSchema>;
