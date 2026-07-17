"use client";

import { EditorState, TextSelection } from "prosemirror-state";
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
import {
  findInBlocks,
  listSceneHeadings,
  findHighlightPlugin,
  buildFindDecorations,
  FIND_HIGHLIGHTS_META,
  type FindMatch,
} from "./find-navigate.js";
import { FindBar } from "./FindBar.js";
import { ScenePalette } from "./ScenePalette.js";
import {
  manglishPlugin,
  MANGLISH_TOGGLE,
  type FetchCandidates,
} from "./manglish/plugin.js";
import { sceneNumbersPlugin } from "./scene-numbers.js";
import { transliterate } from "./manglish/transliterate.js";

export interface ScriptEditorProps {
  initialDocument: ScreenplayDocument;
  profile?: FormatProfile;
  onChange?: (doc: ScreenplayDocument) => void;
  paginationWorker?: Worker;
  /**
   * Manglish IME: given a Latin token, returns ordered Malayalam candidates.
   * Defaults to an offline rule-based transliterator when omitted.
   */
  transliterate?: FetchCandidates;
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
 * What the element dropdown offers: the ⌘-cycle set plus the outline marker
 * types (section/synopsis) — reachable by menu but deliberately not part of
 * the ⌘1–⌘9 typing cycle.
 */
const DROPDOWN_SWITCH_ORDER: readonly BlockType[] = [
  ...EXPLICIT_SWITCH_ORDER,
  "section",
  "synopsis",
];

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

export function ScriptEditor({ initialDocument, profile = usFeatureProfile, onChange, paginationWorker, transliterate: fetchCandidates }: ScriptEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fetchCandidatesRef = useRef<FetchCandidates | undefined>(fetchCandidates);
  fetchCandidatesRef.current = fetchCandidates;
  const [manglishOn, setManglishOn] = useState(false);
  const [currentType, setCurrentType] = useState<BlockType>(initialDocument.blocks[0]?.type ?? "action");
  const [announcement, setAnnouncement] = useState("");

  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [writingMode, setWritingMode] = useState<WritingMode>(() => loadWritingMode());

  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findElementFilter, setFindElementFilter] = useState<BlockType | null>(null);
  const [findMatches, setFindMatches] = useState<FindMatch[]>([]);
  const [findCurrent, setFindCurrent] = useState(0);

  const [scenePaletteVisible, setScenePaletteVisible] = useState(false);

  const editorCSS = useMemo(() => generateEditorCSS(profile), [profile]);

  const writingModeRef = useRef(writingMode);
  writingModeRef.current = writingMode;

  const findStateRef = useRef({ query: findQuery, filter: findElementFilter, matches: findMatches, current: findCurrent });
  findStateRef.current = { query: findQuery, filter: findElementFilter, matches: findMatches, current: findCurrent };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const doc = toPmDoc(initialDocument.blocks.length > 0 ? initialDocument.blocks : [{ id: crypto.randomUUID(), type: "action", text: "", marks: [], attrs: {} }]);
    const plugins = elementBehaviorPlugins(profile);
    plugins.push(focusModePlugin());
    plugins.push(findHighlightPlugin());
    plugins.push(sceneNumbersPlugin());
    if (paginationWorker) plugins.push(paginationPlugin(paginationWorker));
    // Manglish IME goes to the FRONT so its key handling (Space/Enter/1-9)
    // preempts the element-behavior keymap while a candidate is pending.
    plugins.unshift(
      manglishPlugin((latin) => {
        const fn = fetchCandidatesRef.current;
        return fn ? fn(latin) : Promise.resolve([transliterate(latin)]);
      }),
    );
    const state = EditorState.create({ doc, plugins });

    const view = new EditorView(mount, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        const $from = newState.selection.$from;
        if ($from.depth > 0) {
          const newType = $from.node($from.depth).type.name as BlockType;
          setCurrentType((prev) => {
            if (prev !== newType) {
              setAnnouncement(`Now editing: ${ELEMENT_LABELS[newType]}`);
            }
            return newType;
          });
        }

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

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (!findQuery) {
      setFindMatches([]);
      setFindCurrent(0);
      const tr = view.state.tr.setMeta(FIND_HIGHLIGHTS_META, undefined);
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
      return;
    }

    const blocks = toBlocks(view.state.doc);
    const matches = findInBlocks(blocks, findQuery, findElementFilter);
    setFindMatches(matches);
    const current = 0;
    setFindCurrent(current);

    const decos = buildFindDecorations(view.state.doc, matches, current);
    const tr = view.state.tr.setMeta(FIND_HIGHLIGHTS_META, decos);
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);

    if (matches.length > 0) {
      navigateToMatch(view, matches[0]!);
    }
  }, [findQuery, findElementFilter]);

  function navigateToMatch(view: EditorView, match: FindMatch): void {
    let pos = 0;
    for (let j = 0; j < match.blockIndex; j++) {
      pos += view.state.doc.child(j).nodeSize;
    }
    const from = pos + 1 + match.charStart;
    const to = pos + 1 + match.charEnd;
    try {
      const sel = TextSelection.create(view.state.doc, from, to);
      const tr = view.state.tr.setSelection(sel).scrollIntoView();
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
    } catch {
      // position out of range
    }
  }

  function handleFindNavigate(delta: number): void {
    const view = viewRef.current;
    if (!view || findMatches.length === 0) return;
    const next = ((findCurrent + delta) % findMatches.length + findMatches.length) % findMatches.length;
    setFindCurrent(next);

    const decos = buildFindDecorations(view.state.doc, findMatches, next);
    const tr = view.state.tr.setMeta(FIND_HIGHLIGHTS_META, decos);
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);

    navigateToMatch(view, findMatches[next]!);
  }

  function handleFindClose(): void {
    setFindVisible(false);
    setFindQuery("");
    setFindElementFilter(null);
    setFindMatches([]);
    setFindCurrent(0);
    const view = viewRef.current;
    if (view) {
      const tr = view.state.tr.setMeta(FIND_HIGHLIGHTS_META, undefined);
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
      view.focus();
    }
  }

  function handleSceneSelect(blockIndex: number): void {
    const view = viewRef.current;
    if (!view) return;
    let pos = 0;
    for (let j = 0; j < blockIndex && j < view.state.doc.childCount; j++) {
      pos += view.state.doc.child(j).nodeSize;
    }
    try {
      const sel = TextSelection.create(view.state.doc, pos + 1);
      const tr = view.state.tr.setSelection(sel).scrollIntoView();
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
      view.focus();
    } catch {
      // position out of range
    }
  }

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
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setFindVisible((v) => {
          if (v) {
            handleFindClose();
            return false;
          }
          return true;
        });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setScenePaletteVisible((v) => !v);
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

  const handleManglishToggle = useCallback(() => {
    setManglishOn((on) => {
      const next = !on;
      const view = viewRef.current;
      if (view) {
        view.dispatch(view.state.tr.setMeta(MANGLISH_TOGGLE, next));
        requestAnimationFrame(() => view.focus());
      }
      return next;
    });
  }, []);

  const scenes = useMemo(() => {
    const view = viewRef.current;
    if (!view) return [];
    return listSceneHeadings(toBlocks(view.state.doc));
  }, [scenePaletteVisible]);

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
      <div className="script-editor-gutter" role="toolbar" aria-label="Editor toolbar" data-testid="element-indicator">
        <span data-testid="current-element-label" aria-hidden="true">{ELEMENT_LABELS[currentType]}</span>
        <select
          aria-label="Switch element type"
          data-testid="element-dropdown"
          value={currentType}
          onChange={(e) => handleSwitch(e.target.value as BlockType)}
        >
          {DROPDOWN_SWITCH_ORDER.map((type) => (
            <option key={type} value={type}>
              {ELEMENT_LABELS[type]}
            </option>
          ))}
        </select>
        <div className="mode-toolbar" role="group" aria-label="Writing mode" data-testid="mode-toolbar">
          <select
            aria-label="Color theme"
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
              aria-label={`${MODE_LABELS[m]} mode`}
              aria-pressed={writingMode === m}
              data-testid={`mode-${m}`}
              data-active={writingMode === m ? "true" : undefined}
              onClick={() => handleModeChange(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
          <button
            type="button"
            aria-label="Manglish input (type Malayalam phonetically)"
            aria-pressed={manglishOn}
            data-testid="manglish-toggle"
            data-active={manglishOn ? "true" : undefined}
            onClick={handleManglishToggle}
            title="Type Malayalam by spelling it in English"
          >
            {manglishOn ? "മംഗ്ലീഷ്" : "Manglish"}
          </button>
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="sr-announcement">
        {announcement}
      </div>
      {findVisible && (
        <FindBar
          query={findQuery}
          onQueryChange={setFindQuery}
          elementFilter={findElementFilter}
          onElementFilterChange={setFindElementFilter}
          matchCount={findMatches.length}
          currentMatch={findCurrent}
          onPrev={() => handleFindNavigate(-1)}
          onNext={() => handleFindNavigate(1)}
          onClose={handleFindClose}
        />
      )}
      <div ref={mountRef} className="script-editor-content" role="document" aria-label="Screenplay editor" data-testid="script-editor-content" />
      {scenePaletteVisible && (
        <ScenePalette
          scenes={scenes}
          onSelect={handleSceneSelect}
          onClose={() => {
            setScenePaletteVisible(false);
            viewRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
