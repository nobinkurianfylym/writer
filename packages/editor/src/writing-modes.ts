import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { WritingMode, ThemeMode } from "./editor-styles.js";

interface FocusState {
  enabled: boolean;
  decorations: DecorationSet;
}

export const focusModeKey = new PluginKey<FocusState>("focusMode");
export const FOCUS_MODE_META = "focusModeEnabled";

function findActiveSceneRange(doc: import("prosemirror-model").Node, pos: number): { from: number; to: number } {
  let sceneStart = 0;
  let sceneEnd = doc.content.size;

  doc.forEach((_node, nodeOffset) => {
    const node = doc.nodeAt(nodeOffset);
    if (!node) return;
    const nodeStart = nodeOffset + 1;

    if (node.type.name === "scene_heading") {
      if (nodeStart <= pos) {
        sceneStart = nodeOffset;
      }
      if (nodeStart > pos && nodeOffset < sceneEnd) {
        sceneEnd = nodeOffset;
      }
    }
  });

  return { from: sceneStart, to: sceneEnd };
}

function buildFocusDecorations(doc: import("prosemirror-model").Node, pos: number): DecorationSet {
  const { from: sceneFrom, to: sceneTo } = findActiveSceneRange(doc, pos);
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (offset < sceneFrom || offset >= sceneTo) return;
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, { class: "active-scene" }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export function focusModePlugin(): Plugin {
  return new Plugin({
    key: focusModeKey,
    state: {
      init(): FocusState {
        return { enabled: false, decorations: DecorationSet.empty };
      },
      apply(tr, prev, _oldState, newState): FocusState {
        const metaEnabled = tr.getMeta(FOCUS_MODE_META) as boolean | undefined;
        const enabled = metaEnabled !== undefined ? metaEnabled : prev.enabled;

        if (!enabled) {
          return { enabled, decorations: DecorationSet.empty };
        }

        return {
          enabled,
          decorations: buildFocusDecorations(newState.doc, newState.selection.from),
        };
      },
    },
    props: {
      decorations(state) {
        return focusModeKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

const STORAGE_KEY_THEME = "fylym-editor-theme";
const STORAGE_KEY_MODE = "fylym-editor-mode";

export function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

export function loadWritingMode(): WritingMode {
  if (typeof window === "undefined") return "normal";
  const stored = localStorage.getItem(STORAGE_KEY_MODE);
  if (stored === "normal" || stored === "focus" || stored === "typewriter" || stored === "zen") return stored;
  return "normal";
}

export function saveWritingMode(mode: WritingMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_MODE, mode);
}

export function resolveThemeAttr(theme: ThemeMode): string | undefined {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return undefined;
}

export function scrollCursorToCenter(editorEl: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || rect.height === 0) return;

  const container = editorEl.closest("[data-testid='script-editor']") ?? editorEl.parentElement;
  if (!container) return;

  const scrollParent = findScrollParent(container as HTMLElement);
  if (!scrollParent) return;

  const scrollRect = scrollParent.getBoundingClientRect();
  const cursorMiddle = rect.top + rect.height / 2;
  const viewportMiddle = scrollRect.top + scrollRect.height / 2;
  const delta = cursorMiddle - viewportMiddle;

  scrollParent.scrollBy({ top: delta, behavior: "auto" });
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    if (node === document.documentElement || node === document.body) return node;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return document.documentElement;
}
