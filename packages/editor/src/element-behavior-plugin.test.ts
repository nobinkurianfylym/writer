import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { transitionCommand } from "./commands.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import { smartTypeRules } from "./smart-type-rules.js";
import { blockContentStart, typeText } from "./test-utils.js";

function stateAtBlockStart(blocks: Block[]): EditorState {
  const doc = toPmDoc(blocks);
  return EditorState.create({
    doc,
    plugins: elementBehaviorPlugins(),
    selection: TextSelection.create(doc, blockContentStart(doc, 0)),
  });
}

/** Runs a command against `state` and returns the resulting state (asserting it was actually handled). */
function press(state: EditorState, command: Command): EditorState {
  let result = state;
  const ok = command(state, (tr) => {
    result = state.apply(tr);
  });
  expect(ok).toBe(true);
  return result;
}

describe("elementBehaviorPlugins: end-to-end", () => {
  it("auto-caps and smart-type-detects a scene heading as it's typed, with the full plugin bundle registered", () => {
    const state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
    const next = typeText(state, "int. house - day", smartTypeRules);
    // The scene-heading rule retypes and inserts lowercase; the autocaps
    // appendTransaction (also in the bundle) should then uppercase it.
    expect(toBlocks(next.doc)[0]).toMatchObject({ type: "scene_heading", text: "INT. HOUSE - DAY" });
  });

  it("types a short scene using only Tab/Enter and smart-type detection — no explicit element switch needed", () => {
    let state = stateAtBlockStart([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);

    // Smart-type: "int. house - day" -> scene_heading (auto-capped).
    state = typeText(state, "int. house - day", smartTypeRules);

    // Enter -> new action block (ENTER_NON_EMPTY.scene_heading === "action").
    state = press(state, transitionCommand("Enter"));
    state = typeText(state, "Maya enters the room.", smartTypeRules);

    // Enter -> new action block (ENTER_NON_EMPTY.action === "action"), then
    // Tab retypes that new empty block in place: action -> character.
    state = press(state, transitionCommand("Enter"));
    state = press(state, transitionCommand("Tab"));
    state = typeText(state, "maya", smartTypeRules); // auto-capped by the bundle
    state = press(state, transitionCommand("Enter")); // character + Enter -> dialogue
    state = typeText(state, "Well, this is it.", smartTypeRules);

    const blocks = toBlocks(state.doc);
    expect(blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "scene_heading", text: "INT. HOUSE - DAY" },
      { type: "action", text: "Maya enters the room." },
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "Well, this is it." },
    ]);
  });
});
