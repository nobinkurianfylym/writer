import { Plugin, PluginKey, type Command } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { tokenizeSceneHeading, type Block, type BlockType } from "@fylym/screenplay-core";
import { toBlocks } from "../converters.js";
import { screenplaySchema } from "../schema.js";
import { characterNameSuggestions, exchangeOpeningCharacter, extensionSuggestions, sceneLocationSuggestions } from "./suggestions.js";

export interface AutocompleteState {
  /** Doc position where the ghost text renders — the end of what's typed so far. */
  pos: number;
  /** What's been typed so far that the suggestion completes. */
  typed: string;
  /** The single top-ranked candidate's full completion text; the rendered ghost is `suggestion.slice(typed.length)`. */
  suggestion: string;
  kind: "character" | "scene_location" | "extension";
  /** Set by Escape — suppresses rendering until `pos`/`typed` change (a new keystroke narrows or resets the match). */
  dismissed: boolean;
}

export const autocompleteKey = new PluginKey<AutocompleteState | null>("autocomplete");

/** Everything after the last unclosed "(" in a character cue's text — the in-progress extension being typed, e.g. "MAYA (V" -> "V". `null` if there's no open, unclosed paren. */
function extensionPrefix(text: string): string | null {
  const lastOpen = text.lastIndexOf("(");
  if (lastOpen === -1) return null;
  if (text.slice(lastOpen).includes(")")) return null;
  return text.slice(lastOpen + 1);
}

type PendingSuggestion = Omit<AutocompleteState, "dismissed">;

function computeSuggestion(
  blocks: readonly Block[],
  blockIndex: number,
  blockType: BlockType,
  textSoFar: string,
  blockContentStart: number,
): PendingSuggestion | null {
  const pos = blockContentStart + textSoFar.length;

  if (blockType === "character") {
    const extPrefix = extensionPrefix(textSoFar);
    if (extPrefix !== null) {
      const top = extensionSuggestions(extPrefix)[0];
      if (!top || top.toUpperCase() === extPrefix.toUpperCase()) return null;
      return { pos, typed: extPrefix, suggestion: top, kind: "extension" };
    }

    const top = characterNameSuggestions(blocks, blockIndex, textSoFar)[0];
    if (!top || top.toUpperCase() === textSoFar.toUpperCase()) return null;
    return { pos, typed: textSoFar, suggestion: top, kind: "character" };
  }

  if (blockType === "scene_heading") {
    const tokens = tokenizeSceneHeading(textSoFar);
    if (tokens.sceneType === null || tokens.time !== null) return null;
    const top = sceneLocationSuggestions(blocks, blockIndex, tokens.location)[0];
    if (!top || top.toUpperCase() === tokens.location.toUpperCase()) return null;
    return { pos, typed: tokens.location, suggestion: top, kind: "scene_location" };
  }

  return null;
}

/**
 * Ghost-text autocomplete for scene-heading locations, character names, and
 * character-cue extensions (E2-3) — all sourced from what's already in the
 * document (`toBlocks`), never a fixed dictionary except the four standard
 * extensions. Rendered as a dimmed inline decoration after the cursor;
 * accepted via `acceptSuggestionCommand` (bind to Tab in the keymap chain,
 * ahead of the normal Tab/Enter transition commands), dismissed via
 * `dismissSuggestionCommand` (bind to Escape). A character-name suggestion
 * that becomes uniquely determined by what's typed so far is committed
 * automatically (see `element-behavior-plugin.ts`'s appendTransaction) —
 * the "one keystroke" completion the two-character alternating case needs.
 */
export function autocompletePlugin(): Plugin<AutocompleteState | null> {
  return new Plugin<AutocompleteState | null>({
    key: autocompleteKey,
    state: {
      init: () => null,
      apply(tr, prev, _oldState, newState) {
        if (tr.getMeta(autocompleteKey) === "dismiss") {
          return prev ? { ...prev, dismissed: true } : null;
        }
        if (!tr.docChanged && !tr.selectionSet) return prev;
        if (!newState.selection.empty) return null;

        const $from = newState.selection.$from;
        const depth = $from.depth;
        if (depth === 0) return null;
        const blockNode = $from.node(depth);
        const blockType = blockNode.type.name as BlockType;
        if (blockType !== "character" && blockType !== "scene_heading") return null;
        if ($from.parentOffset !== blockNode.textContent.length) return null; // only suggest at the end of what's typed

        const blockIndex = $from.index(depth - 1);
        const blockContentStart = $from.before(depth) + 1;
        const blocks = toBlocks(newState.doc);
        const computed = computeSuggestion(blocks, blockIndex, blockType, blockNode.textContent, blockContentStart);
        if (!computed) return null;

        const dismissed = prev !== null && prev.pos === computed.pos && prev.typed === computed.typed && prev.dismissed;
        return { ...computed, dismissed };
      },
    },
    props: {
      decorations(state) {
        const suggestion = autocompleteKey.getState(state);
        if (!suggestion || suggestion.dismissed) return null;
        const ghost = suggestion.suggestion.slice(suggestion.typed.length);
        if (!ghost) return null;

        const widget = Decoration.widget(
          suggestion.pos,
          () => {
            const span = document.createElement("span");
            span.className = "autocomplete-ghost";
            span.setAttribute("data-testid", "autocomplete-ghost");
            span.style.opacity = "0.4";
            span.textContent = ghost;
            return span;
          },
          { side: 1, key: `autocomplete-${suggestion.kind}-${suggestion.pos}-${suggestion.typed}` },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
    },
    /**
     * "First-letter acceptance" (E2-3): once what's typed into a character
     * cue narrows the candidate list to exactly one name, the rest is
     * committed immediately — no separate Tab/Enter needed. This is what
     * makes "Enter, Enter, first letter" a complete three-keystroke cue in
     * the two-character alternating case (`characterNameSuggestions`
     * already rotates the *other* speaker to the front, so an empty
     * prefix's one candidate — when there are only two people total and
     * the other one is a strict prefix match — completes on the very next
     * keystroke). Scoped to forward text insertion only (checked via a doc
     * size increase) so it never fires on backspace, retype, or paste.
     */
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      if (newState.doc.content.size <= oldState.doc.content.size) return null;
      if (!newState.selection.empty) return null;

      const $from = newState.selection.$from;
      const depth = $from.depth;
      if (depth === 0) return null;
      const node = $from.node(depth);
      if (node.type.name !== "character") return null;
      if ($from.parentOffset !== node.textContent.length) return null;

      const typed = node.textContent;
      if (!typed) return null;

      const blockIndex = $from.index(depth - 1);
      const blocks = toBlocks(newState.doc);
      const candidates = characterNameSuggestions(blocks, blockIndex, typed);
      if (candidates.length !== 1) return null;
      const only = candidates[0]!;
      if (only.toUpperCase() === typed.toUpperCase()) return null;

      return newState.tr.insertText(only.slice(typed.length), $from.pos);
    },
  });
}

/** Inserts the remainder of the currently-showing ghost suggestion, if any. Bind ahead of Tab/Enter in the keymap chain. */
export const acceptSuggestionCommand: Command = (state, dispatch) => {
  const suggestion = autocompleteKey.getState(state);
  if (!suggestion || suggestion.dismissed) return false;
  const ghost = suggestion.suggestion.slice(suggestion.typed.length);
  if (!ghost) return false;

  if (dispatch) dispatch(state.tr.insertText(ghost, suggestion.pos));
  return true;
};

/** Dismisses the currently-showing suggestion (Escape always dismisses — E2-3's accept criterion). */
export const dismissSuggestionCommand: Command = (state, dispatch) => {
  const suggestion = autocompleteKey.getState(state);
  if (!suggestion || suggestion.dismissed) return false;

  if (dispatch) dispatch(state.tr.setMeta(autocompleteKey, "dismiss"));
  return true;
};

/**
 * The "Enter+Enter+Tab-free" fast path (E2-3's named exit test): pressing
 * Enter on an *already-empty* dialogue block that's part of an established
 * character-opened exchange retypes it straight to `character` in place —
 * rather than falling through to the default Enter-on-empty demotion to
 * `action` (which would need a further Tab to reach `character`). The
 * autocomplete plugin's own state.apply then picks up the resulting
 * (empty) character block on the very same transaction and offers the
 * next-speaker suggestion immediately.
 */
export const smartDialogueAdvanceCommand: Command = (state, dispatch) => {
  const $from = state.selection.$from;
  const depth = $from.depth;
  if (depth === 0) return false;
  const node = $from.node(depth);
  if (node.type.name !== "dialogue" || node.textContent.length > 0) return false;

  const blockIndex = $from.index(depth - 1);
  const blocks = toBlocks(state.doc);
  if (exchangeOpeningCharacter(blocks, blockIndex) === null) return false;

  if (dispatch) {
    const blockStart = $from.before(depth);
    dispatch(state.tr.setNodeMarkup(blockStart, screenplaySchema.nodes.character!, node.attrs));
  }
  return true;
};
