import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import { BLOCK_TYPES, type BlockType } from "@fylym/screenplay-core";

/**
 * Attrs every block-level node carries, mirroring `BlockAttrs` plus the
 * `Block.id` screenplay-core itself tracks out of band — ProseMirror has no
 * native concept of a stable per-node id, so it has to be a plain attr here
 * for `toBlocks`/`toPmDoc` to round-trip losslessly. `null` (not `undefined`
 * — ProseMirror attrs must be JSON-serializable) stands in for "absent".
 */
const blockAttrs: NodeSpec["attrs"] = {
  id: { default: null },
  sceneNumber: { default: null },
  revision: { default: null },
  locked: { default: false },
  dualColumn: { default: null },
  elementNumber: { default: null },
  passthrough: { default: null },
};

/**
 * `dual_dialogue`/`page_break` carry no text (screenplay-core's
 * STRUCTURAL_MARKER_TYPES — see pagination/layout.ts); everything else is
 * inline text content. Nothing here declares `content: "block+"` except
 * `doc` itself, so the schema makes "dialogue inside dialogue" (or any
 * block-inside-block nesting) structurally unrepresentable — ProseMirror
 * rejects any transaction that would produce it, at the transform level,
 * before it ever reaches the document (see schema.test.ts).
 */
const EMPTY_CONTENT_TYPES: ReadonlySet<BlockType> = new Set(["dual_dialogue", "page_break"]);

/**
 * A plain, unstyled `<p data-block-type="...">` for every block — this
 * package only owns structure/behavior, not visual formatting (indent,
 * width, spacing come from a FormatProfile and are E2-6's concern). The
 * `data-block-type`/`data-block-id` attributes are what any later CSS or
 * DOM-inspecting code (including Playwright selectors) hooks into.
 */
function blockNodeSpec(type: BlockType): NodeSpec {
  return {
    content: EMPTY_CONTENT_TYPES.has(type) ? "" : "text*",
    group: "block",
    attrs: blockAttrs,
    marks: "bold italic underline strike revision",
    toDOM(node) {
      return ["p", { "data-block-type": type, "data-block-id": node.attrs.id as string }, 0];
    },
    parseDOM: [{ tag: `p[data-block-type="${type}"]` }],
  };
}

const nodes: Record<string, NodeSpec> = Object.fromEntries(
  BLOCK_TYPES.map((type) => [type, blockNodeSpec(type)]),
);
nodes.doc = { content: "block+" };
nodes.text = { group: "inline" };

const marks: Record<string, MarkSpec> = {
  bold: { toDOM: () => ["strong", 0], parseDOM: [{ tag: "strong" }, { tag: "b" }] },
  italic: { toDOM: () => ["em", 0], parseDOM: [{ tag: "em" }, { tag: "i" }] },
  underline: { toDOM: () => ["u", 0], parseDOM: [{ tag: "u" }] },
  strike: { toDOM: () => ["s", 0], parseDOM: [{ tag: "s" }] },
  /** Dormant until Phase 4 (revision tracking) — the mark exists and round-trips, but no editor behavior sets it yet. */
  revision: {
    attrs: { revisionColor: { default: null } },
    toDOM(mark) {
      return ["span", { "data-revision-color": (mark.attrs.revisionColor as string | null) ?? "" }, 0];
    },
  },
};

/** The ProseMirror schema mirroring screenplay-core's Block model: one top-level node type per `BlockType`, attrs mirroring `BlockAttrs`, and bold/italic/underline/strike/revision marks. */
export const screenplaySchema = new Schema({ nodes, marks });
