import { z } from "zod";
import { registry } from "./registry.js";

export const ExportFormatSchema = registry.register(
  "ExportFormat",
  z.enum(["pdf", "fdx", "fountain"]).openapi("ExportFormat"),
);

export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ExportOptionsSchema = registry.register(
  "ExportOptions",
  z
    .object({
      sceneNumbers: z.boolean().default(false),
      watermark: z.string().max(200).optional(),
      titlePage: z.boolean().default(true),
    })
    .openapi("ExportOptions"),
);

export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

export const CreateExportSchema = registry.register(
  "CreateExport",
  z
    .object({
      format: ExportFormatSchema,
      options: ExportOptionsSchema.optional(),
    })
    .openapi("CreateExport"),
);

export type CreateExport = z.infer<typeof CreateExportSchema>;

export const ExportAcceptedSchema = registry.register(
  "ExportAccepted",
  z.object({ jobId: z.string() }).openapi("ExportAccepted"),
);

export type ExportAccepted = z.infer<typeof ExportAcceptedSchema>;
