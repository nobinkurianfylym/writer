import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PmNode } from "prosemirror-model";

export const sceneNumbersKey = new PluginKey<DecorationSet>("sceneNumbers");

/**
 * The number a scene heading displays: an explicit attrs.sceneNumber override
 * if set (e.g. "12A" in a production draft), otherwise its 1-based ordinal
 * among scene headings.
 */
export function displaySceneNumber(doc: PmNode, blockIndex: number): string | null {
  let ordinal = 0;
  for (let i = 0; i <= blockIndex && i < doc.childCount; i++) {
    const child = doc.child(i);
    if (child.type.name !== "scene_heading") continue;
    ordinal += 1;
    if (i === blockIndex) {
      const custom = child.attrs.sceneNumber;
      return typeof custom === "string" && custom.length > 0 ? custom : String(ordinal);
    }
  }
  return null;
}

function buildDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  let pos = 0;
  let ordinal = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (child.type.name === "scene_heading") {
      ordinal += 1;
      const custom =
        typeof child.attrs.sceneNumber === "string" && child.attrs.sceneNumber.length > 0
          ? child.attrs.sceneNumber
          : null;
      const label = custom ?? String(ordinal);
      const blockPos = pos;
      // ProseMirror hands the live EditorView to the widget's toDOM callback,
      // so click-to-edit can dispatch without the plugin holding a view ref.
      decos.push(
        Decoration.widget(
          pos + 1,
          (view) => sceneNumberWidget(label, custom !== null, blockPos, view),
          { side: -1, key: `scene-${i}-${label}-${custom !== null}` },
        ),
      );
    }
    pos += child.nodeSize;
  }
  return DecorationSet.create(doc, decos);
}

/** The margin chip. Click swaps it for an input; Enter/blur commits, Esc cancels. Empty input clears the override (back to auto). */
function sceneNumberWidget(
  label: string,
  isCustom: boolean,
  blockPos: number,
  view: EditorView,
): HTMLElement {
  const el = document.createElement("span");
  el.className = "scene-number";
  el.textContent = label;
  el.contentEditable = "false";
  el.setAttribute("data-testid", "scene-number");
  if (isCustom) el.setAttribute("data-custom", "true");
  el.title = "Scene number — click to edit (empty resets to automatic)";

  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (el.querySelector("input")) return;

    const input = document.createElement("input");
    input.className = "scene-number-input";
    input.value = label;
    input.maxLength = 8;
    input.setAttribute("data-testid", "scene-number-input");
    el.textContent = "";
    el.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = (save: boolean) => {
      if (done) return;
      done = true;
      if (save) {
        const value = input.value.trim();
        const node = view.state.doc.nodeAt(blockPos);
        if (node && node.type.name === "scene_heading") {
          const attrs = { ...node.attrs, sceneNumber: value.length > 0 ? value : null };
          view.dispatch(view.state.tr.setNodeMarkup(blockPos, undefined, attrs));
        }
      }
      // Rebuild the widget text in case no transaction fired (unchanged value).
      if (input.parentNode === el) {
        el.removeChild(input);
        el.textContent = label;
      }
      view.focus();
    };

    input.addEventListener("keydown", (ke) => {
      ke.stopPropagation();
      if (ke.key === "Enter") {
        ke.preventDefault();
        commit(true);
      } else if (ke.key === "Escape") {
        ke.preventDefault();
        commit(false);
      }
    });
    input.addEventListener("blur", () => commit(true));
  });

  return el;
}

/**
 * Numbers every scene heading in the margin: automatic ordinals that renumber
 * live as scenes move, with per-scene manual overrides stored in
 * attrs.sceneNumber (so they persist and flow into FDX/PDF exports).
 */
export function sceneNumbersPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: sceneNumbersKey,
    state: {
      init: (_config, state) => buildDecorations(state.doc),
      apply(tr, value, _old, newState) {
        if (tr.docChanged) return buildDecorations(newState.doc);
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return sceneNumbersKey.getState(state);
      },
    },
  });
}
