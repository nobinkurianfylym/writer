export const BLOCK_TYPES = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "shot",
  "lyric",
  "centered",
  "dual_dialogue",
  "note",
  "section",
  "synopsis",
  "page_break",
  "title_page",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const MARK_KINDS = ["bold", "italic", "underline", "strike", "revision"] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

/** A mark applies to the half-open character range [start, end) of Block.text. */
export interface MarkRange {
  kind: MarkKind;
  start: number;
  end: number;
  /** Only meaningful when kind === "revision", e.g. "blue", "pink". */
  revisionColor?: string;
}

export type DualColumn = "left" | "right";

export interface BlockAttrs {
  sceneNumber?: string;
  revision?: string;
  locked?: boolean;
  dualColumn?: DualColumn;
  elementNumber?: string;
  /**
   * Opaque, import-format-specific data preserved verbatim so re-export
   * doesn't destroy it (e.g. an FDX paragraph's unrecognized attributes or
   * child elements — see fdx/parse.ts) — never interpreted by
   * screenplay-core itself, and not touched by normalize().
   */
  passthrough?: Record<string, unknown>;
}

export interface Block {
  /** UUID, immutable for the block's lifetime — normalize() never changes an existing id. */
  id: string;
  type: BlockType;
  text: string;
  marks: MarkRange[];
  attrs: BlockAttrs;
}

/**
 * The canonical in-memory screenplay: an ordered list of typed blocks (§4).
 *
 * Dual dialogue is represented in this flat sequence as a `dual_dialogue`
 * marker block (empty text, no semantic content of its own) immediately
 * followed by one or more blocks with `attrs.dualColumn === "left"`, then one
 * or more with `attrs.dualColumn === "right"`. A block tagged `dualColumn`
 * outside of such a marker+left+right run is a structural violation that
 * normalize() repairs (see normalize.ts).
 */
export interface ScreenplayDocument {
  blocks: Block[];
  /**
   * Opaque, import-format-specific document-level data preserved verbatim
   * for re-export (e.g. an FDX file's unrecognized root attributes/elements
   * — see fdx/parse.ts). Not guaranteed to survive an intermediate
   * normalize() call, whose job is structural repair, not metadata
   * preservation — only a direct parse-then-serialize round-trip is.
   */
  passthrough?: Record<string, unknown>;
}
