"use client";

import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState } from "react";
import { usFeatureProfile, type BlockType, type FormatProfile, type ScreenplayDocument } from "@fylym/screenplay-core";
import { EXPLICIT_SWITCH_ORDER, switchElementCommand } from "./commands.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import { paginationPlugin } from "./pagination/plugin.js";

export interface ScriptEditorProps {
  initialDocument: ScreenplayDocument;
  /** Governs page geometry, spacing, and which element types auto-caps — defaults to the standard US feature profile. */
  profile?: FormatProfile;
  onChange?: (doc: ScreenplayDocument) => void;
  /** When provided, pagination runs in this Web Worker and page-break decorations appear. The editor degrades gracefully if the worker dies. */
  paginationWorker?: Worker;
}

const ELEMENT_LABELS: Record<BlockType, string> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  shot: "Shot",
  lyric: "Lyric",
  centered: "Centered",
  dual_dialogue: "Dual Dialogue",
  note: "Note",
  section: "Section",
  synopsis: "Synopsis",
  page_break: "Page Break",
  title_page: "Title Page",
};

/**
 * The framework-thin screenplay editor (§Epic E2). Mounts a ProseMirror
 * `EditorView` with the full E2-2 element-behavior bundle (Tab/Enter,
 * Backspace-merge, ⌘1–⌘9, smart-type, auto-caps) and renders a gutter
 * showing the current block's element type plus a dropdown for explicit
 * switching — the mouse-driven equivalent of ⌘1–⌘9, not a replacement for
 * it, since the ticket's exit test is "zero mouse interactions required."
 */
export function ScriptEditor({ initialDocument, profile = usFeatureProfile, onChange, paginationWorker }: ScriptEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [currentType, setCurrentType] = useState<BlockType>(initialDocument.blocks[0]?.type ?? "action");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const doc = toPmDoc(initialDocument.blocks.length > 0 ? initialDocument.blocks : [{ id: crypto.randomUUID(), type: "action", text: "", marks: [], attrs: {} }]);
    const plugins = elementBehaviorPlugins(profile);
    if (paginationWorker) plugins.push(paginationPlugin(paginationWorker));
    const state = EditorState.create({ doc, plugins });

    const view = new EditorView(mount, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        const $from = newState.selection.$from;
        if ($from.depth > 0) setCurrentType($from.node($from.depth).type.name as BlockType);

        if (tr.docChanged) onChangeRef.current?.({ blocks: toBlocks(newState.doc) });
      },
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mounts once; initialDocument/profile are only read at mount time —
    // this is an uncontrolled component (like a plain <textarea defaultValue>),
    // matching how every ProseMirror-in-React integration works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwitch(type: BlockType): void {
    const view = viewRef.current;
    if (!view) return;
    switchElementCommand(type)(view.state, view.dispatch);
    view.focus();
  }

  return (
    <div className="script-editor" data-testid="script-editor">
      <div className="script-editor-gutter" data-testid="element-indicator">
        <span data-testid="current-element-label">{ELEMENT_LABELS[currentType]}</span>
        <select
          aria-label="Switch element type"
          data-testid="element-dropdown"
          value={currentType}
          onChange={(e) => handleSwitch(e.target.value as BlockType)}
        >
          {EXPLICIT_SWITCH_ORDER.map((type) => (
            <option key={type} value={type}>
              {ELEMENT_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div ref={mountRef} className="script-editor-content" data-testid="script-editor-content" />
    </div>
  );
}
