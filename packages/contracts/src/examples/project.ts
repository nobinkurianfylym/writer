import { z } from "zod";
import { registry } from "../registry.js";

export const ProjectSchema = registry.register(
  "Project",
  z
    .object({
      id: z.string().uuid().openapi({ example: "8f14e45f-ceea-4d6b-8a5a-fa6c0e1cb0be" }),
      name: z.string().min(1).max(200),
      createdAt: z.string().datetime(),
    })
    .openapi("Project"),
);

export type Project = z.infer<typeof ProjectSchema>;
