import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { usFeatureProfile, type Block } from "@fylym/screenplay-core";
import { autoCapsPlugin } from "./autocaps.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { blockContentStart } from "./test-utils.js";

function stateWithAutoCaps(blocks: Block[]): EditorState {
  const doc = toPmDoc(blocks);
  return EditorState.create({ doc, plugins: [autoCapsPlugin(usFeatureProfile)] });
}

describe("autoCapsPlugin", () => {
  it("uppercases text inserted into a caps-type block (scene_heading)", () => {
    const blocks: Block[] = [{ id: "b1", type: "scene_heading", text: "", marks: [], attrs: {} }];
    const state = stateWithAutoCaps(blocks);
    const pos = blockContentStart(state.doc, 0);
    const next = state.apply(state.tr.insertText("int. house", pos));
    expect(toBlocks(next.doc)[0]?.text).toBe("INT. HOUSE");
  });

  it("uppercases text inserted into character and transition blocks too, per usFeatureProfile's caps flags", () => {
    for (const type of ["character", "transition", "shot", "section"] as const) {
      const blocks: Block[] = [{ id: "b1", type, text: "", marks: [], attrs: {} }];
      const state = stateWithAutoCaps(blocks);
      const pos = blockContentStart(state.doc, 0);
      const next = state.apply(state.tr.insertText("mixed Case", pos));
      expect(toBlocks(next.doc)[0]?.text).toBe("MIXED CASE");
    }
  });

  it("leaves text in a non-caps block untouched (action, dialogue)", () => {
    for (const type of ["action", "dialogue"] as const) {
      const blocks: Block[] = [{ id: "b1", type, text: "", marks: [], attrs: {} }];
      const state = stateWithAutoCaps(blocks);
      const pos = blockContentStart(state.doc, 0);
      const next = state.apply(state.tr.insertText("mixed Case", pos));
      expect(toBlocks(next.doc)[0]?.text).toBe("mixed Case");
    }
  });

  it("preserves marks on the uppercased text", () => {
    const blocks: Block[] = [{ id: "b1", type: "scene_heading", text: "", marks: [], attrs: {} }];
    const state = stateWithAutoCaps(blocks);
    const pos = blockContentStart(state.doc, 0);
    const boldMark = state.schema.marks.bold!.create();
    const tr = state.tr.insertText("int. house", pos);
    tr.addMark(pos, pos + "int. house".length, boldMark);
    const next = state.apply(tr);
    const result = toBlocks(next.doc)[0]!;
    expect(result.text).toBe("INT. HOUSE");
    expect(result.marks).toEqual([{ kind: "bold", start: 0, end: "INT. HOUSE".length }]);
  });

  it("only touches text that actually needs it, leaving already-uppercase content's transaction count minimal (idempotent)", () => {
    const blocks: Block[] = [{ id: "b1", type: "scene_heading", text: "ALREADY UPPER", marks: [], attrs: {} }];
    const state = stateWithAutoCaps(blocks);
    // A no-op selection-only transaction shouldn't trigger any rewrite.
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, blockContentStart(state.doc, 0))));
    expect(toBlocks(next.doc)).toEqual(blocks);
  });
});
