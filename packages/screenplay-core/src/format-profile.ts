import { z } from "zod";
import { BLOCK_TYPES, type BlockType } from "./model.js";

export const MarginsSchema = z.object({
  top: z.number().positive(),
  bottom: z.number().positive(),
  left: z.number().positive(),
  right: z.number().positive(),
});
export type Margins = z.infer<typeof MarginsSchema>;

export const ElementStyleSchema = z.object({
  /** Inches from the left edge of the page to the start of the text block. */
  indent: z.number().min(0),
  /** Width of the text measure, in inches. */
  width: z.number().min(0),
  caps: z.boolean(),
  align: z.enum(["left", "center", "right"]).optional(),
  italic: z.boolean().optional(),
  /** Blank lines inserted before/after this element during pagination. */
  spaceBefore: z.number().int().min(0),
  spaceAfter: z.number().int().min(0),
});
export type ElementStyle = z.infer<typeof ElementStyleSchema>;

export const PaginationRulesSchema = z.object({
  /** Text lines that fit in the page's vertical text area at 12pt Courier (6 lines/inch). */
  linesPerPage: z.number().int().positive(),
  moreText: z.string().min(1),
  continuedText: z.string().min(1),
  /** Minimum contiguous lines of a block required on a page before/after a break (widow/orphan control). */
  minOrphanLines: z.number().int().min(0),
  /** A scene heading needs at least this many following lines on the same page, else it moves with them. */
  sceneHeadingMinLinesBeforeBreak: z.number().int().min(0),
  /** TV act-break markers force a page break; features don't have acts. */
  honorsActBreaks: z.boolean(),
});
export type PaginationRules = z.infer<typeof PaginationRulesSchema>;

const elementsShape = Object.fromEntries(
  BLOCK_TYPES.map((type) => [type, ElementStyleSchema] as const),
) as Record<BlockType, typeof ElementStyleSchema>;

export const FormatProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  page: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    margins: MarginsSchema,
  }),
  elements: z.object(elementsShape),
  pagination: PaginationRulesSchema,
});
export type FormatProfile = z.infer<typeof FormatProfileSchema>;

/**
 * Validates a plain data object against FormatProfileSchema. Throws a
 * single-line error naming the offending JSON path on failure — profiles are
 * data, not code, so this is the only gate between "content added" and "bug".
 */
export function parseFormatProfile(data: unknown): FormatProfile {
  const result = FormatProfileSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "(root)";
    throw new Error(`Invalid format profile at "${path}": ${issue?.message}`);
  }
  return result.data;
}
