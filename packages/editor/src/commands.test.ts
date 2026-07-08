import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { backspaceMergeCommand, switchElementCommand, transitionCommand } from "./commands.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { blockContentStart } from "./test-utils.js";

function stateFor(blocks: Block[], cursorPos: number): EditorState {
  const doc = toPmDoc(blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, cursorPos) });
}

function applyCommand(state: EditorState, command: Command): { ok: boolean; state: EditorState } {
  let result = state;
  const ok = command(state, (tr) => {
    result = state.apply(tr);
  });
  return { ok, state: result };
}

describe("transitionCommand: Tab", () => {
  it("retypes action to character, in place, cursor position unchanged", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hello", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0) + 5);
    const { ok, state: next } = applyCommand(state, transitionCommand("Tab"));
    expect(ok).toBe(true);
    const result = toBlocks(next.doc);
    expect(result).toEqual([{ id: "b1", type: "character", text: "hello", marks: [], attrs: {} }]);
  });

  it("toggles dialogue <-> parenthetical instead of the main cycle", () => {
    const blocks: Block[] = [{ id: "b1", type: "dialogue", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
    const { state: next } = applyCommand(state, transitionCommand("Tab"));
    expect(toBlocks(next.doc)[0]?.type).toBe("parenthetical");
  });

  it("cycles through the full main cycle: action -> character -> transition -> shot -> action", () => {
    let type: Block["type"] = "action";
    const expected = ["character", "transition", "shot", "action"];
    for (const nextType of expected) {
      const blocks: Block[] = [{ id: "b1", type, text: "", marks: [], attrs: {} }];
      const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
      const { state: next } = applyCommand(state, transitionCommand("Tab"));
      type = toBlocks(next.doc)[0]!.type;
      expect(type).toBe(nextType);
    }
  });
});

describe("transitionCommand: Enter", () => {
  it("on a non-empty character block, creates a new dialogue block after and moves the cursor into it", () => {
    const blocks: Block[] = [{ id: "b1", type: "character", text: "MAYA", marks: [], attrs: {} }];
    const cursorAtEnd = blockContentStart(toPmDoc(blocks), 0) + 4;
    const state = stateFor(blocks, cursorAtEnd);
    const { ok, state: next } = applyCommand(state, transitionCommand("Enter"));
    expect(ok).toBe(true);
    const result = toBlocks(next.doc);
    expect(result.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "" },
    ]);
  });

  it("always creates a new block even on an already-empty block (per transition.spec.md's documented contract)", () => {
    const blocks: Block[] = [{ id: "b1", type: "dialogue", text: "", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
    const { state: next } = applyCommand(state, transitionCommand("Enter"));
    const result = toBlocks(next.doc);
    expect(result.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "dialogue", text: "" },
      { type: "action", text: "" }, // ENTER_EMPTY.dialogue === "action"
    ]);
  });

  it("splits at the cursor: text after the cursor moves into the new block, text before stays in the original (unchanged type)", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hello world", marks: [], attrs: {} }];
    const midCursor = blockContentStart(toPmDoc(blocks), 0) + 5; // right after "hello"
    const state = stateFor(blocks, midCursor);
    const { state: next } = applyCommand(state, transitionCommand("Enter"));
    const result = toBlocks(next.doc);
    expect(result.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "action", text: "hello" },
      { type: "action", text: " world" }, // ENTER_NON_EMPTY.action === "action"
    ]);
  });

  it("deletes a range selection first, then splits at that point", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hello world", marks: [], attrs: {} }];
    const doc = toPmDoc(blocks);
    const start = blockContentStart(doc, 0);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, start + 2, start + 7) }); // selects "llo w"
    const { state: next } = applyCommand(state, transitionCommand("Enter"));
    const result = toBlocks(next.doc);
    expect(result.map((b) => b.text)).toEqual(["he", "orld"]);
  });
});

describe("backspaceMergeCommand", () => {
  it("merges the current block into the end of the previous block, keeping the previous block's type", () => {
    const blocks: Block[] = [
      { id: "b1", type: "action", text: "Maya enters", marks: [], attrs: {} },
      { id: "b2", type: "character", text: "MAYA", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 1));
    const { ok, state: next } = applyCommand(state, backspaceMergeCommand);
    expect(ok).toBe(true);
    const result = toBlocks(next.doc);
    expect(result).toEqual([{ id: "b1", type: "action", text: "Maya entersMAYA", marks: [], attrs: {} }]);
  });

  it("is a no-op at the first block (nothing to merge into)", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
    expect(backspaceMergeCommand(state)).toBe(false);
  });

  it("is a no-op when the cursor isn't at the very start of the block", () => {
    const blocks: Block[] = [
      { id: "b1", type: "action", text: "hi", marks: [], attrs: {} },
      { id: "b2", type: "action", text: "there", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 1) + 2);
    expect(backspaceMergeCommand(state)).toBe(false);
  });

  it("is a no-op when the previous block can't hold inline content (a structural marker)", () => {
    const blocks: Block[] = [
      { id: "b1", type: "page_break", text: "", marks: [], attrs: {} },
      { id: "b2", type: "action", text: "hi", marks: [], attrs: {} },
    ];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 1));
    expect(backspaceMergeCommand(state)).toBe(false);
  });
});

describe("switchElementCommand", () => {
  it("retypes the current block to the given type, keeping its content", () => {
    const blocks: Block[] = [{ id: "b1", type: "action", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
    const { ok, state: next } = applyCommand(state, switchElementCommand("shot"));
    expect(ok).toBe(true);
    expect(toBlocks(next.doc)[0]?.type).toBe("shot");
  });

  it("is a handled no-op when already that type", () => {
    const blocks: Block[] = [{ id: "b1", type: "shot", text: "hi", marks: [], attrs: {} }];
    const state = stateFor(blocks, blockContentStart(toPmDoc(blocks), 0));
    expect(switchElementCommand("shot")(state)).toBe(true);
  });
});
