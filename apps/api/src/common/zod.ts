import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function zodParse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException({
      message: "Request validation failed",
      details: result.error.flatten(),
    });
  }
  return result.data as z.infer<T>;
}
