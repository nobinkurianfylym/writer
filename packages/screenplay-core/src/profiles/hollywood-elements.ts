import type { ElementStyle } from "../format-profile.js";
import type { BlockType } from "../model.js";

/**
 * Element geometry for the "Hollywood standard" — 12pt Courier, 10 chars/inch,
 * 6 lines/inch, on 8.5x11 paper with a 1.5" left / 1" right margin. These are
 * the indent/width measurements published across virtually every US
 * screenwriting format guide and matched by Final Draft's default template.
 * Shared verbatim by us-feature and us-tv-onehour: the two formats look
 * identical on the page and diverge only in act structure (PaginationRules),
 * not element geometry.
 *
 * NOTE: per the Phase 1 build plan, these numbers are a human-verification
 * gate — confirm against a real formatted script before relying on them for
 * pagination (E1-5) or PDF export (E1-8).
 */
export const HOLLYWOOD_ELEMENTS: Record<BlockType, ElementStyle> = {
  scene_heading: { indent: 1.5, width: 6.0, caps: true, spaceBefore: 2, spaceAfter: 1 },
  action: { indent: 1.5, width: 6.0, caps: false, spaceBefore: 1, spaceAfter: 0 },
  character: { indent: 3.7, width: 3.3, caps: true, spaceBefore: 1, spaceAfter: 0 },
  dialogue: { indent: 2.5, width: 3.5, caps: false, spaceBefore: 0, spaceAfter: 0 },
  parenthetical: { indent: 3.1, width: 2.0, caps: false, spaceBefore: 0, spaceAfter: 0 },
  transition: {
    indent: 6.0,
    width: 1.5,
    caps: true,
    align: "right",
    spaceBefore: 1,
    spaceAfter: 1,
  },
  shot: { indent: 1.5, width: 6.0, caps: true, spaceBefore: 1, spaceAfter: 0 },
  lyric: { indent: 2.5, width: 3.5, caps: false, italic: true, spaceBefore: 0, spaceAfter: 0 },
  centered: {
    indent: 1.5,
    width: 6.0,
    caps: false,
    align: "center",
    spaceBefore: 1,
    spaceAfter: 1,
  },
  // Marker block bracketing a left+right column run (§4); the columns
  // inherit character/dialogue geometry, halved, in the pagination engine
  // (E1-5) — this nominal style is only a Record<BlockType, _> completeness
  // requirement, never rendered directly.
  dual_dialogue: { indent: 1.5, width: 6.0, caps: false, spaceBefore: 1, spaceAfter: 0 },
  // Author-only annotation — not printed. Italicized so an editor that does
  // render it (e.g. a "show notes" mode) visually distinguishes it.
  note: { indent: 1.5, width: 6.0, caps: false, italic: true, spaceBefore: 0, spaceAfter: 0 },
  // Non-printing structural marker (Fountain `#`).
  section: { indent: 1.5, width: 6.0, caps: true, spaceBefore: 1, spaceAfter: 1 },
  // Non-printing outline note (Fountain `=`).
  synopsis: {
    indent: 1.5,
    width: 6.0,
    caps: false,
    italic: true,
    spaceBefore: 0,
    spaceAfter: 1,
  },
  // Pure structural marker; no visual footprint of its own.
  page_break: { indent: 0, width: 0, caps: false, spaceBefore: 0, spaceAfter: 0 },
  // Rendered via a dedicated title-page layout (E1-8/E2-6), not the flowing
  // element system.
  title_page: { indent: 0, width: 0, caps: false, spaceBefore: 0, spaceAfter: 0 },
};
