import { z } from "zod";
import { BLOCK_TYPES, type BlockType } from "./model.js";

/** Page margins, in inches. */
export interface Margins {
  /** Inches from the top edge of the page to the first line of body text. */
  top: number;
  /** Inches reserved at the bottom of the page before the next page break. */
  bottom: number;
  /** Inches from the left page edge to the text measure's left edge. */
  left: number;
  /** Inches reserved on the right edge of the page. */
  right: number;
}

/** Runtime validator for `Margins` — see `parseFormatProfile`. */
export const MarginsSchema: z.ZodType<Margins> = z.object({
  top: z.number().positive(),
  bottom: z.number().positive(),
  left: z.number().positive(),
  right: z.number().positive(),
});

/** How one `BlockType` is measured and spaced on the page — the per-element half of a `FormatProfile`. */
export interface ElementStyle {
  /** Inches from the left edge of the page to the start of the text block. */
  indent: number;
  /** Width of the text measure, in inches. */
  width: number;
  /** Whether this element's text is conventionally all-caps (e.g. scene headings, character cues). Display-only — screenplay-core never mutates stored text to enforce it. */
  caps: boolean;
  /** Horizontal alignment of the text measure. Left-aligned when omitted. */
  align?: "left" | "center" | "right";
  /** Whether this element is conventionally italicized (e.g. lyrics, notes). */
  italic?: boolean;
  /** Blank lines inserted before this element during pagination. */
  spaceBefore: number;
  /** Blank lines inserted after this element during pagination. */
  spaceAfter: number;
}

/** Runtime validator for `ElementStyle` — see `parseFormatProfile`. */
export const ElementStyleSchema: z.ZodType<ElementStyle> = z.object({
  indent: z.number().min(0),
  width: z.number().min(0),
  caps: z.boolean(),
  align: z.enum(["left", "center", "right"]).optional(),
  italic: z.boolean().optional(),
  spaceBefore: z.number().int().min(0),
  spaceAfter: z.number().int().min(0),
});

/** The pagination rules a `FormatProfile` supplies to `paginate()`/`repaginate()` — see pagination/solver.ts for how each rule is applied. */
export interface PaginationRules {
  /** Text lines that fit in the page's vertical text area at 12pt Courier (6 lines/inch). */
  linesPerPage: number;
  /** The literal string synthesized as a dialogue-split marker at the bottom of a page (e.g. "(MORE)"). */
  moreText: string;
  /** The literal string synthesized at the top of a page continuing a split dialogue block (e.g. "(CONT'D)"). */
  continuedText: string;
  /** Minimum contiguous lines of a block required on a page before/after a break (widow/orphan control). */
  minOrphanLines: number;
  /** A scene heading needs at least this many following lines on the same page, else it moves with them. */
  sceneHeadingMinLinesBeforeBreak: number;
  /** TV act-break markers force a page break; features don't have acts. */
  honorsActBreaks: boolean;
}

/** Runtime validator for `PaginationRules` — see `parseFormatProfile`. */
export const PaginationRulesSchema: z.ZodType<PaginationRules> = z.object({
  linesPerPage: z.number().int().positive(),
  moreText: z.string().min(1),
  continuedText: z.string().min(1),
  minOrphanLines: z.number().int().min(0),
  sceneHeadingMinLinesBeforeBreak: z.number().int().min(0),
  honorsActBreaks: z.boolean(),
});

/** The physical page dimensions and margins of a `FormatProfile`, in inches. */
export interface PageDimensions {
  /** Page width, in inches (e.g. 8.5 for US Letter). */
  width: number;
  /** Page height, in inches (e.g. 11 for US Letter). */
  height: number;
  /** Page margins, in inches. */
  margins: Margins;
}

const elementsShape = Object.fromEntries(
  BLOCK_TYPES.map((type) => [type, ElementStyleSchema] as const),
) as Record<BlockType, typeof ElementStyleSchema>;

/**
 * A complete typesetting/pagination profile: page size and margins, one
 * `ElementStyle` per `BlockType`, and the pagination rules that govern where
 * pages break. `usFeatureProfile` and `usTvOneHourProfile` are the two
 * profiles shipped with this package; add another by building a plain data
 * object matching this shape and passing it through `parseFormatProfile`.
 */
export interface FormatProfile {
  /** Stable identifier, e.g. "us-feature". */
  id: string;
  /** Human-readable name, e.g. "US Feature". */
  name: string;
  /** Physical page size and margins. */
  page: PageDimensions;
  /** One `ElementStyle` per `BlockType` (§4) — every block type must have an entry, even ones with no visual footprint like `page_break`. */
  elements: Record<BlockType, ElementStyle>;
  /** The rules governing where pages break. */
  pagination: PaginationRules;
}

/** Runtime validator for `FormatProfile` — see `parseFormatProfile`. */
export const FormatProfileSchema: z.ZodType<FormatProfile> = z.object({
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
