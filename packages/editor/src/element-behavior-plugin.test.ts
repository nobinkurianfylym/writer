import { chainCommands } from "prosemirror-commands";
import { EditorState, TextSelection, type Command } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import type { Block } from "@fylym/screenplay-core";
import { acceptSuggestionCommand, smartDialogueAdvanceCommand } from "./autocomplete/plugin.js";
import { transitionCommand } from "./commands.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import { smartTypeRules } from "./smart-type-rules.js";
import { blockContentStart, typeText } from "./test-utils.js";

/** The exact composition element-behavior-plugin.ts binds to Enter — assembled here (not fished out of the Plugin's internal keymap) so this test exercises the real, documented chain rather than a reimplementation of it. */
const pressEnter = chainCommands(acceptSuggestionCommand, smartDialogueAdvanceCommand, transitionCommand("Enter"));

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

  it("E2-3's exit test: two-character alternating dialogue needs only Enter, Enter, first letter — no Tab", () => {
    let state = stateAtBlockStart([{ id: "b1", type: "character", text: "", marks: [], attrs: {} }]);
    state = typeText(state, "maya", smartTypeRules);
    state = press(state, pressEnter); // character -> dialogue
    state = typeText(state, "You're up early.", smartTypeRules);
    state = press(state, pressEnter); // dialogue (non-empty) -> new empty dialogue
    state = press(state, pressEnter); // smartDialogueAdvanceCommand: empty dialogue -> character (no Tab)
    state = typeText(state, "s", smartTypeRules); // no other name yet — types literally

    let blocks = toBlocks(state.doc);
    expect(blocks.map((b) => b.type)).toEqual(["character", "dialogue", "character"]);
    expect(blocks[2]?.text).toBe("S"); // auto-capped; nothing to complete against yet

    state = press(state, pressEnter); // character (non-empty) -> dialogue
    state = typeText(state, "Not looking up.", smartTypeRules);
    state = press(state, pressEnter); // dialogue -> new empty dialogue
    state = press(state, pressEnter); // -> character, suggesting the other speaker (MAYA)
    state = typeText(state, "m", smartTypeRules); // first-letter acceptance: uniquely completes to MAYA

    blocks = toBlocks(state.doc);
    expect(blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "You're up early." },
      { type: "character", text: "S" },
      { type: "dialogue", text: "Not looking up." },
      { type: "character", text: "MAYA" },
    ]);
  });
});
