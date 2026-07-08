import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { toBlocks, toPmDoc } from "../converters.js";
import { blockContentStart } from "../test-utils.js";
import {
  acceptSuggestionCommand,
  autocompleteKey,
  autocompletePlugin,
  dismissSuggestionCommand,
  smartDialogueAdvanceCommand,
} from "./plugin.js";

/**
 * `EditorState.create()` never runs a plugin's `apply()` — only a real
 * transaction does, since `init()` alone produced the starting value (here,
 * always `null`). A freshly-constructed state is never what a real editor
 * session looks like (the user always got to any given cursor position via
 * *some* transaction), so this applies one no-op selection-set transaction
 * immediately, mirroring that.
 */
function stateFor(blocks: Block[], cursorBlockIndex: number, offsetInBlock = 0): EditorState {
  const doc = toPmDoc(blocks);
  const pos = blockContentStart(doc, cursorBlockIndex) + offsetInBlock;
  const initial = EditorState.create({ doc, selection: TextSelection.create(doc, pos), plugins: [autocompletePlugin()] });
  return initial.apply(initial.tr.setSelection(initial.selection));
}

function applyCommand(state: EditorState, command: Command): { ok: boolean; state: EditorState } {
  let result = state;
  const ok = command(state, (tr) => {
    result = state.apply(tr);
  });
  return { ok, state: result };
}

function typeChar(state: EditorState, ch: string): EditorState {
  const pos = state.selection.from;
  return state.apply(state.tr.insertText(ch, pos));
}

describe("autocompletePlugin: character name ghost suggestion", () => {
  it("suggests the other of two alternating speakers on an empty character block", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "character", text: "SAM", marks: [], attrs: {} },
      { id: "b4", type: "dialogue", text: "Hey.", marks: [], attrs: {} },
      { id: "b5", type: "character", text: "", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 4);
    const suggestion = autocompleteKey.getState(state);
    expect(suggestion).toMatchObject({ typed: "", suggestion: "MAYA", kind: "character", dismissed: false });
  });

  it("narrows as the user types, showing no suggestion once nothing matches", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "character", text: "", marks: [], attrs: {} },
    ];
    let state = stateFor(blocks, 2);
    expect(autocompleteKey.getState(state)?.suggestion).toBe("MAYA");

    state = typeChar(state, "Z"); // doesn't match "MAYA"
    expect(autocompleteKey.getState(state)).toBeNull();
  });
});

describe("autocompletePlugin: scene-heading location ghost suggestion", () => {
  it("suggests a previously-used location once a scene-type prefix is recognized", () => {
    const blocks: Block[] = [
      { id: "b1", type: "scene_heading", text: "INT. HOUSE - DAY", marks: [], attrs: {} },
      { id: "b2", type: "action", text: "x", marks: [], attrs: {} },
      { id: "b3", type: "scene_heading", text: "INT. ", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 2, "INT. ".length);
    expect(autocompleteKey.getState(state)).toMatchObject({ typed: "", suggestion: "HOUSE", kind: "scene_location" });
  });

  it("suggests nothing before a scene-type prefix is recognized", () => {
    const blocks: Block[] = [
      { id: "b1", type: "scene_heading", text: "INT. HOUSE - DAY", marks: [], attrs: {} },
      { id: "b2", type: "scene_heading", text: "so", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 1, 2);
    expect(autocompleteKey.getState(state)).toBeNull();
  });
});

describe("autocompletePlugin: extension ghost suggestion", () => {
  it("suggests a matching extension once an unclosed '(' is typed in a character cue", () => {
    const blocks: Block[] = [{ id: "b1", type: "character", text: "MAYA (V", marks: [], attrs: {} }];
    const state = stateFor(blocks, 0, "MAYA (V".length);
    expect(autocompleteKey.getState(state)).toMatchObject({ typed: "V", suggestion: "V.O.", kind: "extension" });
  });

  it("suggests nothing once the parenthetical is closed", () => {
    const blocks: Block[] = [{ id: "b1", type: "character", text: "MAYA (V.O.)", marks: [], attrs: {} }];
    const state = stateFor(blocks, 0, "MAYA (V.O.)".length);
    expect(autocompleteKey.getState(state)).toBeNull();
  });
});

describe("acceptSuggestionCommand", () => {
  it("inserts the remainder of the showing suggestion", () => {
    const blocks: Block[] = [
      { id: "b1", type: "scene_heading", text: "INT. HOUSE - DAY", marks: [], attrs: {} },
      { id: "b2", type: "action", text: "x", marks: [], attrs: {} },
      { id: "b3", type: "scene_heading", text: "INT. ", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 2, "INT. ".length);
    const { ok, state: next } = applyCommand(state, acceptSuggestionCommand);
    expect(ok).toBe(true);
    expect(toBlocks(next.doc)[2]?.text).toBe("INT. HOUSE");
  });

  it("returns false when no suggestion is showing", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, 0, 2);
    expect(acceptSuggestionCommand(state)).toBe(false);
  });
});

describe("dismissSuggestionCommand", () => {
  it("hides the suggestion until the typed prefix changes", () => {
    // Two names sharing a first letter (MARCUS/MAYA) so that typing "M"
    // narrows to two remaining candidates rather than uniquely completing
    // one — isolating the dismiss/reset behavior from first-letter
    // auto-commit (tested separately below).
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MARCUS", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b4", type: "dialogue", text: "Hey.", marks: [], attrs: {} },
      { id: "b5", type: "character", text: "SAM", marks: [], attrs: {} },
      { id: "b6", type: "dialogue", text: "Yo.", marks: [], attrs: {} },
      { id: "b7", type: "character", text: "", marks: [], attrs: {} },
    ];
    let state = stateFor(blocks, 6);
    expect(autocompleteKey.getState(state)).toMatchObject({ typed: "", suggestion: "MAYA", dismissed: false });

    const { ok, state: dismissed } = applyCommand(state, dismissSuggestionCommand);
    expect(ok).toBe(true);
    expect(autocompleteKey.getState(dismissed)?.dismissed).toBe(true);

    state = typeChar(dismissed, "M");
    expect(autocompleteKey.getState(state)).toMatchObject({ typed: "M", suggestion: "MAYA", dismissed: false });
  });

  it("returns false when nothing is showing", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, 0, 2);
    expect(dismissSuggestionCommand(state)).toBe(false);
  });
});

describe("first-letter acceptance (appendTransaction auto-commit)", () => {
  it("commits the full name once typing narrows to exactly one candidate", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "character", text: "SAM", marks: [], attrs: {} },
      { id: "b4", type: "dialogue", text: "Hey.", marks: [], attrs: {} },
      { id: "b5", type: "character", text: "", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 4);
    const next = typeChar(state, "M"); // only "MAYA" starts with M
    expect(toBlocks(next.doc)[4]?.text).toBe("MAYA");
  });

  it("does not auto-commit while multiple candidates still match", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MARCUS", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b4", type: "dialogue", text: "Hey.", marks: [], attrs: {} },
      { id: "b5", type: "character", text: "", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 4);
    const next = typeChar(state, "M"); // both MARCUS and MAYA still match "M"
    expect(toBlocks(next.doc)[4]?.text).toBe("M");
  });
});

describe("smartDialogueAdvanceCommand", () => {
  it("retypes an empty dialogue block in an established exchange straight to character", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
      { id: "b3", type: "dialogue", text: "", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 2);
    const { ok, state: next } = applyCommand(state, smartDialogueAdvanceCommand);
    expect(ok).toBe(true);
    expect(toBlocks(next.doc).map((b) => b.type)).toEqual(["character", "dialogue", "character"]);
  });

  it("returns false when the dialogue block isn't empty", () => {
    const blocks: Block[] = [
      { id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "Hi.", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 1, 2);
    expect(smartDialogueAdvanceCommand(state)).toBe(false);
  });

  it("returns false when not part of a character-opened exchange", () => {
    const blocks: Block[] = [
      { id: "b1", type: "action", text: "Something happens.", marks: [], attrs: {} },
      { id: "b2", type: "dialogue", text: "", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, 1);
    expect(smartDialogueAdvanceCommand(state)).toBe(false);
  });
});
