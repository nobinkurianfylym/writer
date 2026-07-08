import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { toBlocks, toPmDoc } from "./converters.js";
import { smartTypeRules } from "./smart-type-rules.js";
import { blockContentStart, typeText } from "./test-utils.js";

function stateAtBlockStart(blocks: Block[]): EditorState {
  const doc = toPmDoc(blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, blockContentStart(doc, 0)) });
}

describe("smartTypeRules: scene heading detection", () => {
  it("converts action to scene_heading when a recognized prefix + period + space is typed at block start", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "int. house - day", smartTypeRules);
    expect(toBlocks(next.doc)[0]).toMatchObject({ type: "scene_heading", text: "int. house - day" });
  });

  it("recognizes ext., int./ext., and i/e prefixes too", () => {
    for (const prefix of ["ext.", "int./ext.", "i/e."]) {
      const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
      const next = typeText(state, `${prefix} `, smartTypeRules);
      expect(toBlocks(next.doc)[0]?.type).toBe("scene_heading");
    }
  });

  it("does not trigger on an unrecognized prefix", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "hello. ", smartTypeRules);
    expect(toBlocks(next.doc)[0]).toMatchObject({ type: "action", text: "hello. " });
  });

  it("does not trigger when not at the very start of the block", () => {
    const doc = toPmDoc([{ id: "b1", type: "action", text: "x", marks: [], attrs: {} }]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, blockContentStart(doc, 0) + 1) });
    const next = typeText(state, "int. ", smartTypeRules);
    expect(toBlocks(next.doc)[0]?.type).toBe("action");
  });

  it("does not trigger on a non-action block (e.g. dialogue)", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "dialogue", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "int. ", smartTypeRules);
    expect(toBlocks(next.doc)[0]?.type).toBe("dialogue");
  });
});

describe("smartTypeRules: transition detection", () => {
  it("converts action to transition when a recognized phrase + ':' is typed", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "CUT TO:", smartTypeRules);
    expect(toBlocks(next.doc)[0]).toMatchObject({ type: "transition", text: "CUT TO:" });
  });

  it("does not trigger on an unrecognized colon-terminated phrase", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "note to self:", smartTypeRules);
    expect(toBlocks(next.doc)[0]).toMatchObject({ type: "action", text: "note to self:" });
  });
});
