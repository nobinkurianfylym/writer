/** Every screenplay element type this package models (§4). Order is not semantically meaningful. */
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

/** One of the values in `BLOCK_TYPES`. */
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Every inline emphasis/annotation kind a `MarkRange` can carry. */
export const MARK_KINDS = ["bold", "italic", "underline", "strike", "revision"] as const;

/** One of the values in `MARK_KINDS`. */
export type MarkKind = (typeof MARK_KINDS)[number];

/** A mark applies to the half-open character range [start, end) of Block.text. */
export interface MarkRange {
  /** Which kind of emphasis/annotation this range represents. */
  kind: MarkKind;
  /** Inclusive start offset into the owning Block's `text`. */
  start: number;
  /** Exclusive end offset into the owning Block's `text`. */
  end: number;
  /** Only meaningful when kind === "revision", e.g. "blue", "pink". */
  revisionColor?: string;
}

/** Which side of a dual-dialogue exchange a block belongs to — see `ScreenplayDocument`'s dual-dialogue convention. */
export type DualColumn = "left" | "right";

/** Optional, mostly-format-specific metadata attached to a `Block`. */
export interface BlockAttrs {
  /** Scene number as shown in the margin (e.g. from Fountain's trailing `#114#` or FDX's `Number` attribute). */
  sceneNumber?: string;
  /** Revision (draft) label this block was added/changed in, e.g. "Blue", "Pink". */
  revision?: string;
  /** Whether this block is locked against renumbering/reflow in the editor. */
  locked?: boolean;
  /** Present only on blocks inside a dual-dialogue exchange — see `ScreenplayDocument`. */
  dualColumn?: DualColumn;
  /** Explicit element number (distinct from sceneNumber), as used by some outline/numbering conventions. */
  elementNumber?: string;
  /**
   * Opaque, import-format-specific data preserved verbatim so re-export
   * doesn't destroy it (e.g. an FDX paragraph's unrecognized attributes or
   * child elements — see fdx/parse.ts) — never interpreted by
   * screenplay-core itself, and not touched by normalize().
   */
  passthrough?: Record<string, unknown>;
}

/** One screenplay element — a scene heading, an action paragraph, a line of dialogue, etc. */
export interface Block {
  /** UUID, immutable for the block's lifetime — normalize() never changes an existing id. */
  id: string;
  /** Which screenplay element this block is. */
  type: BlockType;
  /** The block's plain text content, with no markup — emphasis lives in `marks`. */
  text: string;
  /** Inline emphasis/annotation ranges over `text`. */
  marks: MarkRange[];
  /** Optional, mostly-format-specific metadata. */
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
  /** Every block in the document, in on-page order. */
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
