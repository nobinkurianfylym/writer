import type { BlockType } from "../model.js";

/**
 * Maps our BlockType to Final Draft's native `Paragraph Type` attribute.
 *
 * Final Draft's schema only has direct equivalents for the seven "classic"
 * elements. Types with no native FDX counterpart (section, synopsis, note,
 * page_break, centered, lyric, title_page, dual_dialogue) fall back to the
 * closest native type for a plain-text degrade in real Final Draft, and are
 * round-tripped exactly via the custom `FylymType` attribute (see
 * parse.ts/serialize.ts) — an unrecognized attribute Final Draft is expected
 * to ignore. title_page and dual_dialogue are structural rather than
 * per-paragraph and are handled separately, not through this map.
 */
export const NATIVE_FDX_TYPE: Record<BlockType, string> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  shot: "Shot",
  lyric: "Action",
  centered: "Action",
  note: "Action",
  section: "Action",
  synopsis: "Action",
  page_break: "Action",
  // Structural marker types — never actually written with this fallback;
  // present so the Record is total.
  dual_dialogue: "Action",
  title_page: "Action",
};

/** Types whose FDX Paragraph Type is ambiguous with another BlockType and so require the FylymType tiebreaker attribute to round-trip exactly. */
const NEEDS_FYLYM_TYPE = new Set<BlockType>([
  "lyric",
  "centered",
  "note",
  "section",
  "synopsis",
  "page_break",
]);

export function fdxTypeForBlock(type: BlockType): { fdxType: string; fylymType?: string } {
  return {
    fdxType: NATIVE_FDX_TYPE[type],
    fylymType: NEEDS_FYLYM_TYPE.has(type) ? type : undefined,
  };
}

const REVERSE: Record<string, BlockType> = {
  "Scene Heading": "scene_heading",
  Action: "action",
  Character: "character",
  Dialogue: "dialogue",
  Parenthetical: "parenthetical",
  Transition: "transition",
  Shot: "shot",
};

/** Recovers our BlockType from an FDX paragraph's Type attribute plus its FylymType override, if any (e.g. from another writer's file, an unrecognized fdxType conservatively becomes "action"). */
export function blockTypeForFdx(fdxType: string, fylymType: string | undefined): BlockType {
  if (fylymType !== undefined && (BLOCK_TYPE_SET.has(fylymType))) {
    return fylymType as BlockType;
  }
  return REVERSE[fdxType] ?? "action";
}

const BLOCK_TYPE_SET = new Set<string>([
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
]);
