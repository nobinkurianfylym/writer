// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { toBlocks, toPmDoc } from "../converters.js";
import { elementBehaviorPlugins } from "../element-behavior-plugin.js";
import { blockContentStart } from "../test-utils.js";
import { manglishPlugin, manglishKey, MANGLISH_TOGGLE } from "./plugin.js";

function mount(fetchCandidates: (latin: string) => Promise<string[]>): EditorView {
  const doc = toPmDoc([{ id: "b1", type: "action", text: "", marks: [], attrs: {} }]);
  const plugins = elementBehaviorPlugins();
  plugins.unshift(manglishPlugin(fetchCandidates));
  const state = EditorState.create({
    doc,
    plugins,
    selection: TextSelection.create(doc, blockContentStart(doc, 0)),
  });
  const place = document.createElement("div");
  document.body.appendChild(place);
  return new EditorView(place, { state });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstText = (view: EditorView) => toBlocks(view.state.doc)[0]!.text;

describe("manglish IME plugin", () => {
  it("detects the Latin token, fetches candidates, and commits on Space", async () => {
    const view = mount(async () => ["ഞാൻ", "ഞാന്", "ജ്ഞാൻ"]);
    view.dispatch(view.state.tr.setMeta(MANGLISH_TOGGLE, true));
    view.dispatch(view.state.tr.insertText("njaan"));

    const pendingLatin = manglishKey.getState(view.state)?.pending?.latin;
    expect(pendingLatin).toBe("njaan");

    await wait(260); // debounce (150ms) + async fetch resolves
    expect(manglishKey.getState(view.state)?.pending?.candidates[0]).toBe("ഞാൻ");
    expect(document.querySelector('[data-testid="manglish-bar"]')).not.toBeNull();

    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(firstText(view)).toBe("ഞാൻ ");
    view.destroy();
  });

  it("picks an alternate with a number key", async () => {
    const view = mount(async () => ["ഞാൻ", "ഞാന്", "ജ്ഞാൻ"]);
    view.dispatch(view.state.tr.setMeta(MANGLISH_TOGGLE, true));
    view.dispatch(view.state.tr.insertText("njaan"));
    await wait(260);

    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true, cancelable: true }));
    expect(firstText(view)).toBe("ജ്ഞാൻ ");
    view.destroy();
  });

  it("Escape keeps the Latin text", async () => {
    const view = mount(async () => ["ഞാൻ"]);
    view.dispatch(view.state.tr.setMeta(MANGLISH_TOGGLE, true));
    view.dispatch(view.state.tr.insertText("njaan"));
    await wait(260);

    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(manglishKey.getState(view.state)?.pending).toBeNull();
    expect(firstText(view)).toBe("njaan");
    view.destroy();
  });

  it("does nothing when disabled", async () => {
    const view = mount(async () => ["ഞാൻ"]);
    view.dispatch(view.state.tr.insertText("njaan"));
    await wait(200);
    expect(manglishKey.getState(view.state)?.pending).toBeNull();
    expect(firstText(view)).toBe("njaan");
    view.destroy();
  });
});
