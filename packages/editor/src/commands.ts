import type { Node as PMNode } from "prosemirror-model";
import { TextSelection, type Command, type EditorState, type Transaction } from "prosemirror-state";
import { transition, type BlockType, type TransitionKey } from "@fylym/screenplay-core";
import { screenplaySchema } from "./schema.js";

// Web Crypto's randomUUID is a global in both browsers and Node 19+ — no
// node:crypto import needed, matching screenplay-core's own convention.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** The 15 BlockTypes in the order ⌘1–⌘9 cycle through — the 9 elements a writer actually reaches for while typing (per E2-2). Not a claim of parity with any specific existing app's exact keybinding, just a documented, reviewable convention. */
export const EXPLICIT_SWITCH_ORDER: readonly BlockType[] = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "shot",
  "lyric",
  "note",
];

function currentBlock(state: EditorState): { depth: number; node: PMNode } | null {
  const { $from } = state.selection;
  const depth = $from.depth;
  if (depth === 0) return null; // selection sitting directly in doc, no block parent
  return { depth, node: $from.node(depth) };
}

/**
 * Binds `transition()` (E1-3) to a real key. Tab always retypes the current
 * block in place; Enter always splits at the cursor and creates a new block
 * after it, carrying whatever came after the cursor — see
 * transition.spec.md for the full table this defers to. A non-empty
 * (range) selection is deleted first, matching ordinary typing behavior for
 * both keys.
 */
export function transitionCommand(key: TransitionKey): Command {
  return (state, dispatch) => {
    const current = currentBlock(state);
    if (!current) return false;
    const blockType = current.node.type.name as BlockType;
    const isEmpty = current.node.textContent.length === 0;
    const result = transition(blockType, key, isEmpty);
    const nextNodeType = screenplaySchema.nodes[result.nextType];
    if (!nextNodeType) return false;

    if (!dispatch) return true;

    let tr: Transaction = state.tr;
    if (!state.selection.empty) tr = tr.deleteSelection();

    if (result.caret === "retype") {
      const blockStart = tr.selection.$from.before(current.depth);
      tr.setNodeMarkup(blockStart, nextNodeType, current.node.attrs);
    } else {
      const splitPos = tr.selection.$from.pos;
      tr.split(splitPos, 1, [{ type: nextNodeType, attrs: { id: newId() } }]);
      tr.setSelection(TextSelection.near(tr.doc.resolve(splitPos + 1)));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/**
 * Backspace at the very start of a block's content merges it into the end
 * of the previous block, keeping the *previous* block's type — the same
 * "backspace joins with what came before" convention as any text editor,
 * generalized across different block types (which ProseMirror's own
 * generic join commands don't support, since they require matching node
 * types). No-ops (returns false) at the first block, or when the previous
 * block can't hold inline content (a structural marker like page_break).
 */
export const backspaceMergeCommand: Command = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  if ($from.parentOffset !== 0) return false;

  const depth = $from.depth;
  if (depth === 0) return false;
  const blockIndex = $from.index(depth - 1);
  if (blockIndex === 0) return false;

  const parent = $from.node(depth - 1);
  const prevBlock = parent.child(blockIndex - 1);
  if (!prevBlock.type.contentMatch.matchType(screenplaySchema.nodes.text!)) return false;

  if (!dispatch) return true;

  const currentBlockPos = $from.before(depth);
  const currentBlock = $from.node(depth);
  const prevBlockEndPos = currentBlockPos - 1; // just inside prevBlock, before its closing tag

  const tr = state.tr;
  tr.delete(currentBlockPos, currentBlockPos + currentBlock.nodeSize);
  tr.insert(prevBlockEndPos, currentBlock.content);
  tr.setSelection(TextSelection.create(tr.doc, prevBlockEndPos));
  dispatch(tr.scrollIntoView());
  return true;
};

/** Retypes the current block to `type` in place — the ⌘1–⌘9 explicit switch (§E2-2), bypassing the Tab/Enter cycle entirely. */
export function switchElementCommand(type: BlockType): Command {
  return (state, dispatch) => {
    const current = currentBlock(state);
    if (!current) return false;
    const nodeType = screenplaySchema.nodes[type];
    if (!nodeType) return false;
    if (current.node.type === nodeType) return true; // already this type — treat as handled, not a failed command

    if (!dispatch) return true;
    const blockStart = state.selection.$from.before(current.depth);
    const tr = state.tr.setNodeMarkup(blockStart, nodeType, current.node.attrs);
    dispatch(tr);
    return true;
  };
}
