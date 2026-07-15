// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Block } from "@fylym/screenplay-core";
import { toBlocks, toPmDoc } from "./converters.js";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import { blockContentStart } from "./test-utils.js";
import { sceneNumbersPlugin, displaySceneNumber } from "./scene-numbers.js";

const blocks: Block[] = [
  { id: "b1", type: "scene_heading", text: "INT. HOUSE - DAY", marks: [], attrs: {} },
  { id: "b2", type: "action", text: "A room.", marks: [], attrs: {} },
  { id: "b3", type: "scene_heading", text: "EXT. STREET - NIGHT", marks: [], attrs: { sceneNumber: "2A" } },
  { id: "b4", type: "scene_heading", text: "INT. CAR - NIGHT", marks: [], attrs: {} },
];

function mount(): EditorView {
  const doc = toPmDoc(blocks);
  const plugins = elementBehaviorPlugins();
  plugins.push(sceneNumbersPlugin());
  const state = EditorState.create({
    doc,
    plugins,
    selection: TextSelection.create(doc, blockContentStart(doc, 0)),
  });
  const place = document.createElement("div");
  document.body.appendChild(place);
  return new EditorView(place, { state });
}

describe("scene numbers", () => {
  it("displays ordinals, with manual overrides winning", () => {
    const doc = toPmDoc(blocks);
    expect(displaySceneNumber(doc, 0)).toBe("1");
    expect(displaySceneNumber(doc, 1)).toBeNull(); // action block
    expect(displaySceneNumber(doc, 2)).toBe("2A"); // override
    expect(displaySceneNumber(doc, 3)).toBe("3"); // ordinal keeps counting
  });

  it("renders a margin chip per scene heading, marking overrides", () => {
    const view = mount();
    const chips = view.dom.querySelectorAll('[data-testid="scene-number"]');
    expect(chips.length).toBe(3);
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["1", "2A", "3"]);
    expect(chips[1]!.getAttribute("data-custom")).toBe("true");
    view.destroy();
  });

  it("click → edit → Enter persists the override into block attrs", () => {
    const view = mount();
    const chip = view.dom.querySelectorAll('[data-testid="scene-number"]')[0] as HTMLElement;
    chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    const input = view.dom.querySelector('[data-testid="scene-number-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "12A";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(toBlocks(view.state.doc)[0]!.attrs.sceneNumber).toBe("12A");
    const chips = view.dom.querySelectorAll('[data-testid="scene-number"]');
    expect(chips[0]!.textContent).toBe("12A");
    view.destroy();
  });

  it("clearing the input resets to automatic numbering", () => {
    const view = mount();
    // Edit the overridden heading (2A) and clear it.
    const chip = view.dom.querySelectorAll('[data-testid="scene-number"]')[1] as HTMLElement;
    chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const input = view.dom.querySelector('[data-testid="scene-number-input"]') as HTMLInputElement;
    input.value = "";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(toBlocks(view.state.doc)[2]!.attrs.sceneNumber).toBeUndefined();
    const chips = view.dom.querySelectorAll('[data-testid="scene-number"]');
    expect(chips[1]!.textContent).toBe("2");
    view.destroy();
  });

  it("renumbers live when a new scene is inserted above", () => {
    const view = mount();
    // Insert a scene heading block at the very top.
    const heading = view.state.schema.nodes.scene_heading!;
    const node = heading.create({ id: "b0" }, view.state.schema.text("INT. NEW - DAY"));
    view.dispatch(view.state.tr.insert(0, node));

    const chips = view.dom.querySelectorAll('[data-testid="scene-number"]');
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["1", "2", "2A", "4"]);
    view.destroy();
  });
});
