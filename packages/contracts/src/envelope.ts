import { z } from "zod";
import { registry } from "./registry.js";

export const ErrorEnvelopeSchema = registry.register(
  "ErrorEnvelope",
  z
    .object({
      error: z.object({
        code: z.string().openapi({ example: "VALIDATION_ERROR" }),
        message: z.string(),
        details: z.unknown().optional(),
      }),
    })
    .openapi("ErrorEnvelope"),
);

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
