"use client";

import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usFeatureProfile, type BlockType, type FormatProfile, type ScreenplayDocument } from "@fylym/screenplay-core";
import { EXPLICIT_SWITCH_ORDER, switchElementCommand } from "./commands.js";
import { toBlocks, toPmDoc } from "./converters.js";
import { elementBehaviorPlugins } from "./element-behavior-plugin.js";
import { paginationPlugin } from "./pagination/plugin.js";
import { generateEditorCSS, BASE_EDITOR_CSS, type WritingMode, type ThemeMode } from "./editor-styles.js";
import {
  focusModePlugin,
  FOCUS_MODE_META,
  loadTheme,
  saveTheme,
  loadWritingMode,
  saveWritingMode,
  resolveThemeAttr,
  scrollCursorToCenter,
} from "./writing-modes.js";

export interface ScriptEditorProps {
  initialDocument: ScreenplayDocument;
  profile?: FormatProfile;
  onChange?: (doc: ScreenplayDocument) => void;
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

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

const MODE_LABELS: Record<WritingMode, string> = {
  normal: "Normal",
  focus: "Focus",
  typewriter: "Typewriter",
  zen: "Zen",
};

export function ScriptEditor({ initialDocument, profile = usFeatureProfile, onChange, paginationWorker }: ScriptEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [currentType, setCurrentType] = useState<BlockType>(initialDocument.blocks[0]?.type ?? "action");

  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [writingMode, setWritingMode] = useState<WritingMode>(() => loadWritingMode());

  const editorCSS = useMemo(() => generateEditorCSS(profile), [profile]);

  const writingModeRef = useRef(writingMode);
  writingModeRef.current = writingMode;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const doc = toPmDoc(initialDocument.blocks.length > 0 ? initialDocument.blocks : [{ id: crypto.randomUUID(), type: "action", text: "", marks: [], attrs: {} }]);
    const plugins = elementBehaviorPlugins(profile);
    plugins.push(focusModePlugin());
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

        if (writingModeRef.current === "typewriter" && (tr.selectionSet || tr.docChanged)) {
          requestAnimationFrame(() => {
            scrollCursorToCenter(mount);
          });
        }
      },
    });
    viewRef.current = view;

    if (writingModeRef.current === "focus") {
      const initTr = view.state.tr.setMeta(FOCUS_MODE_META, true);
      view.dispatch(initTr);
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleThemeChange = useCallback((t: ThemeMode) => {
    setTheme(t);
    saveTheme(t);
  }, []);

  const handleModeChange = useCallback((m: WritingMode) => {
    setWritingMode(m);
    saveWritingMode(m);

    const view = viewRef.current;
    if (view) {
      const tr = view.state.tr.setMeta(FOCUS_MODE_META, m === "focus");
      view.dispatch(tr);
    }

    if (m === "zen") {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }

    if (view) {
      requestAnimationFrame(() => view.focus());
    }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && writingMode === "zen") {
        handleModeChange("normal");
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [writingMode, handleModeChange]);

  function handleSwitch(type: BlockType): void {
    const view = viewRef.current;
    if (!view) return;
    switchElementCommand(type)(view.state, view.dispatch);
    view.focus();
  }

  const themeAttr = resolveThemeAttr(theme);

  return (
    <div
      className="script-editor"
      data-testid="script-editor"
      data-theme={themeAttr}
      data-writing-mode={writingMode}
    >
      <style>{BASE_EDITOR_CSS}</style>
      <style>{editorCSS}</style>
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
        <div className="mode-toolbar" data-testid="mode-toolbar">
          <select
            aria-label="Theme"
            data-testid="theme-select"
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value as ThemeMode)}
          >
            {(Object.keys(THEME_LABELS) as ThemeMode[]).map((t) => (
              <option key={t} value={t}>{THEME_LABELS[t]}</option>
            ))}
          </select>
          {(Object.keys(MODE_LABELS) as WritingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`mode-${m}`}
              data-active={writingMode === m ? "true" : undefined}
              onClick={() => handleModeChange(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div ref={mountRef} className="script-editor-content" data-testid="script-editor-content" />
    </div>
  );
}
