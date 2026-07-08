import { z } from "zod";
import { registry } from "./registry.js";

export const CursorPageParamsSchema = registry.register(
  "CursorPageParams",
  z
    .object({
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).default(20),
    })
    .openapi("CursorPageParams"),
);

export type CursorPageParams = z.infer<typeof CursorPageParamsSchema>;

export function cursorPageResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
