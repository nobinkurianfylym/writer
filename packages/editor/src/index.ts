export { screenplaySchema } from "./schema.js";
export { toPmDoc, toPmNode, toBlocks, toBlock } from "./converters.js";
export {
  transitionCommand,
  backspaceMergeCommand,
  switchElementCommand,
  EXPLICIT_SWITCH_ORDER,
} from "./commands.js";
export { autoCapsPlugin } from "./autocaps.js";
export { smartTypeRules } from "./smart-type-rules.js";
export { elementBehaviorPlugins } from "./element-behavior-plugin.js";
export { ScriptEditor, type ScriptEditorProps } from "./ScriptEditor.js";
export {
  autocompleteKey,
  autocompletePlugin,
  acceptSuggestionCommand,
  dismissSuggestionCommand,
  smartDialogueAdvanceCommand,
  type AutocompleteState,
} from "./autocomplete/plugin.js";
export {
  characterNameSuggestions,
  sceneLocationSuggestions,
  extensionSuggestions,
  twoCharacterAlternatingPair,
  exchangeOpeningCharacter,
} from "./autocomplete/suggestions.js";
export { paginationKey, paginationPlugin, type PaginationPluginState } from "./pagination/plugin.js";
export { createPaginationHandler } from "./pagination/worker-handler.js";
export type { PaginateRequest, PaginateResponse } from "./pagination/protocol.js";
export { VirtualizedScriptEditor, type VirtualizedScriptEditorProps } from "./VirtualizedScriptEditor.js";
export { VirtualViewport } from "./virtualization/viewport.js";
export { HeightCache, estimateBlockHeight } from "./virtualization/height-estimator.js";
export { TitlePageEditor, type TitlePageEditorProps } from "./TitlePageEditor.js";
export { generateEditorCSS, BASE_EDITOR_CSS, type WritingMode, type ThemeMode } from "./editor-styles.js";
export { focusModePlugin, focusModeKey, FOCUS_MODE_META, loadTheme, saveTheme, loadWritingMode, saveWritingMode } from "./writing-modes.js";
export {
  findInBlocks,
  listSceneHeadings,
  findHighlightPlugin,
  findHighlightKey,
  buildFindDecorations,
  FIND_HIGHLIGHTS_META,
  type FindMatch,
  type SceneEntry,
} from "./find-navigate.js";
export { FindBar, type FindBarProps } from "./FindBar.js";
export { ScenePalette, type ScenePaletteProps } from "./ScenePalette.js";
export {
  createScriptYDoc,
  initContentFromPmDoc,
  yjsPlugins,
  setTitlePageFields,
  getTitlePageFields,
  setMeta,
  getMeta,
  setFormatProfileName,
  getFormatProfileName,
  observeMeta,
  yjsUndo,
  yjsRedo,
  type ScriptYDoc,
  type CreateScriptYDocOptions,
} from "./yjs-binding.js";
export {
  createScriptPersistence,
  clearScriptStorage,
  hydrateFromIdb,
  dbNameForScript,
  type ScriptPersistence,
  type CreatePersistenceOptions,
  type PersistenceStatus,
  type StoragePressureWarning,
} from "./idb-persistence.js";
export {
  takeSnapshot,
  listSnapshots,
  restoreSnapshot,
  clearSnapshots,
  startAutoSnapshots,
  type SnapshotEntry,
  type SnapshotListItem,
  type AutoSnapshotHandle,
} from "./local-snapshots.js";
export {
  manglishPlugin,
  manglishKey,
  MANGLISH_TOGGLE,
  type FetchCandidates,
  type ManglishState,
} from "./manglish/plugin.js";
export { transliterate, transliterateWord } from "./manglish/transliterate.js";
export {
  sceneNumbersPlugin,
  sceneNumbersKey,
  displaySceneNumber,
} from "./scene-numbers.js";
