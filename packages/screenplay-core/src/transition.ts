import { BLOCK_TYPES, type BlockType } from "./model.js";

/** Which key drove a `transition()` call — Tab cycles element type in place; Enter advances to a new block. */
export type TransitionKey = "Tab" | "Enter";

/** What `transition()` says should happen next: which BlockType to move to, and whether that's a retype or a new block. */
export interface TransitionResult {
  /** The BlockType the caret should be in after this transition. */
  nextType: BlockType;
  /**
   * "retype": the current block's type changes in place, caret stays in it
   * (Tab cycling an empty or in-progress block).
   * "newBlock": a new block of nextType is inserted after the current one
   * and the caret moves into it (Enter advancing the document).
   */
  caret: "retype" | "newBlock";
}

/**
 * The outer Tab cycle for "which structural element am I starting" — applies
 * to any type outside the dialogue/parenthetical toggle below. Matches the
 * common screenwriting-editor convention (Fade In, Highland, and Final
 * Draft's own Tab-cycling): Action -> Character -> Transition -> Shot -> Action.
 */
const MAIN_TAB_CYCLE: readonly BlockType[] = ["action", "character", "transition", "shot"];

/**
 * Within a dialogue exchange, Tab toggles between Dialogue and Parenthetical
 * instead of advancing the outer cycle (§4: "dialogue + Tab -> parenthetical").
 */
const DIALOGUE_TAB_TOGGLE: Partial<Record<BlockType, BlockType>> = {
  dialogue: "parenthetical",
  parenthetical: "dialogue",
};

/**
 * Enter on a block with text in it: the "natural next element" a writer
 * would want. Most types continue as themselves (multi-paragraph action,
 * dialogue, lyric, note, synopsis) or advance to the next logical element
 * (character -> dialogue, transition -> the next scene heading).
 */
const ENTER_NON_EMPTY: Record<BlockType, BlockType> = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  dialogue: "dialogue",
  parenthetical: "dialogue",
  transition: "scene_heading",
  shot: "action",
  lyric: "lyric",
  centered: "action",
  dual_dialogue: "action",
  note: "note",
  section: "action",
  synopsis: "synopsis",
  page_break: "action",
  title_page: "action",
};

/**
 * Enter on an *empty* block: a demotion back out to the nearest sensible
 * base element (§4: "empty dialogue + Enter -> action") — the same
 * double-Enter-exits pattern used by list editors generally. Parenthetical
 * demotes only one level, to dialogue, since it only exists nested inside a
 * dialogue exchange.
 */
const ENTER_EMPTY: Record<BlockType, BlockType> = {
  scene_heading: "action",
  action: "action",
  character: "action",
  dialogue: "action",
  parenthetical: "dialogue",
  transition: "action",
  shot: "action",
  lyric: "action",
  centered: "action",
  dual_dialogue: "action",
  note: "action",
  section: "action",
  synopsis: "action",
  page_break: "action",
  title_page: "action",
};

function tabTarget(type: BlockType): BlockType {
  const toggled = DIALOGUE_TAB_TOGGLE[type];
  if (toggled) return toggled;

  const idx = MAIN_TAB_CYCLE.indexOf(type);
  if (idx === -1) return "character"; // types outside the cycle enter it here
  const next = MAIN_TAB_CYCLE[(idx + 1) % MAIN_TAB_CYCLE.length];
  return next ?? "character";
}

/**
 * The Tab/Enter element transition table (§4): a pure, total function over
 * every (currentBlockType, key, isEmpty) triple, with no editor imports. See
 * transition.spec.md, committed alongside, for the full reviewable table.
 */
export function transition(type: BlockType, key: TransitionKey, isEmpty: boolean): TransitionResult {
  if (key === "Tab") {
    return { nextType: tabTarget(type), caret: "retype" };
  }
  const nextType = isEmpty ? ENTER_EMPTY[type] : ENTER_NON_EMPTY[type];
  return { nextType, caret: "newBlock" };
}

// Exhaustiveness guard: throws at module load (not per-call) if a future
// BlockType addition is missed in either Enter table.
for (const type of BLOCK_TYPES) {
  if (!(type in ENTER_NON_EMPTY) || !(type in ENTER_EMPTY)) {
    throw new Error(`transition.ts: missing Enter table entry for BlockType "${type}"`);
  }
}
