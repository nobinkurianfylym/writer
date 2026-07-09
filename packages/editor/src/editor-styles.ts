import type { BlockType, ElementStyle, FormatProfile } from "@fylym/screenplay-core";

const CHARS_PER_INCH = 10;

function elementRule(type: BlockType, style: ElementStyle, leftMargin: number): string {
  const lines: string[] = [];
  const sel = `.ProseMirror p[data-block-type="${type}"]`;

  const marginLeft = `${(style.indent - leftMargin) * CHARS_PER_INCH}ch`;
  const maxWidth = `${style.width * CHARS_PER_INCH}ch`;

  lines.push(`${sel} {`);
  lines.push(`  margin-left: ${marginLeft};`);
  lines.push(`  max-width: ${maxWidth};`);

  if (style.caps) lines.push(`  text-transform: uppercase;`);
  if (style.italic) lines.push(`  font-style: italic;`);
  if (style.align === "center") lines.push(`  text-align: center;`);
  if (style.align === "right") lines.push(`  text-align: right;`);

  const marginTop = style.spaceBefore > 0 ? `${style.spaceBefore}em` : "0";
  const marginBottom = style.spaceAfter > 0 ? `${style.spaceAfter}em` : "0";
  lines.push(`  margin-top: ${marginTop};`);
  lines.push(`  margin-bottom: ${marginBottom};`);
  lines.push(`  padding: 0;`);
  lines.push(`}`);

  return lines.join("\n");
}

const SKIP_TYPES: ReadonlySet<BlockType> = new Set(["page_break", "title_page", "dual_dialogue"]);

export function generateEditorCSS(profile: FormatProfile): string {
  const leftMargin = profile.page.margins.left;
  const pageWidth = profile.page.width - profile.page.margins.left - profile.page.margins.right;

  const rules: string[] = [];

  rules.push(`.ProseMirror {
  font-family: "Courier Prime", "Courier New", Courier, monospace;
  font-size: 12pt;
  line-height: 1;
  max-width: ${pageWidth * CHARS_PER_INCH}ch;
  margin: 0 auto;
  padding: 1in 0;
  outline: none;
  caret-color: var(--editor-caret, currentColor);
}`);

  rules.push(`.ProseMirror p {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}`);

  for (const type of Object.keys(profile.elements) as BlockType[]) {
    if (SKIP_TYPES.has(type)) continue;
    const style = profile.elements[type];
    rules.push(elementRule(type, style, leftMargin));
  }

  rules.push(`.ProseMirror p[data-block-type="page_break"] {
  border-top: 1px dashed var(--editor-page-break, #ccc);
  height: 0;
  margin: 1em 0;
  overflow: hidden;
}`);

  return rules.join("\n\n");
}

export type WritingMode = "normal" | "focus" | "typewriter" | "zen";
export type ThemeMode = "system" | "light" | "dark";

export const BASE_EDITOR_CSS = `
.script-editor {
  position: relative;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.script-editor-gutter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--editor-gutter-fg, hsl(var(--muted-foreground)));
  border-bottom: 1px solid var(--editor-border, hsl(var(--border)));
  background: var(--editor-gutter-bg, transparent);
}

.script-editor-gutter select {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--editor-border, hsl(var(--border)));
  border-radius: 4px;
  background: var(--editor-bg, hsl(var(--background)));
  color: var(--editor-fg, hsl(var(--foreground)));
}

.script-editor-content {
  background: var(--editor-bg, hsl(var(--background)));
  color: var(--editor-fg, hsl(var(--foreground)));
  min-height: 60vh;
}

.script-editor[data-theme="dark"] {
  --editor-bg: hsl(240, 10%, 8%);
  --editor-fg: hsl(0, 0%, 88%);
  --editor-gutter-fg: hsl(240, 5%, 55%);
  --editor-gutter-bg: hsl(240, 10%, 6%);
  --editor-border: hsl(240, 4%, 20%);
  --editor-caret: hsl(0, 0%, 90%);
  --editor-page-break: hsl(240, 4%, 25%);
  --editor-dim: 0.25;
}

.script-editor[data-theme="light"] {
  --editor-bg: hsl(0, 0%, 100%);
  --editor-fg: hsl(240, 10%, 10%);
  --editor-gutter-fg: hsl(240, 4%, 46%);
  --editor-gutter-bg: transparent;
  --editor-border: hsl(240, 6%, 90%);
  --editor-caret: hsl(240, 10%, 10%);
  --editor-page-break: hsl(0, 0%, 80%);
  --editor-dim: 0.2;
}

@media (prefers-color-scheme: dark) {
  .script-editor:not([data-theme="light"]) {
    --editor-bg: hsl(240, 10%, 8%);
    --editor-fg: hsl(0, 0%, 88%);
    --editor-gutter-fg: hsl(240, 5%, 55%);
    --editor-gutter-bg: hsl(240, 10%, 6%);
    --editor-border: hsl(240, 4%, 20%);
    --editor-caret: hsl(0, 0%, 90%);
    --editor-page-break: hsl(240, 4%, 25%);
    --editor-dim: 0.25;
  }
}

.script-editor[data-writing-mode="focus"] .ProseMirror p[data-block-type] {
  opacity: var(--editor-dim, 0.2);
  transition: opacity 0.15s ease;
}

.script-editor[data-writing-mode="focus"] .ProseMirror p[data-block-type].active-scene {
  opacity: 1;
}

.script-editor[data-writing-mode="zen"] {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow-y: auto;
  background: var(--editor-bg, hsl(var(--background)));
}

.script-editor[data-writing-mode="zen"] .script-editor-gutter {
  display: none;
}

.script-editor[data-writing-mode="zen"] .script-editor-content {
  min-height: 100vh;
  padding: 2in 0;
}

.script-editor .mode-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.script-editor .mode-toolbar button {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--editor-border, hsl(var(--border)));
  border-radius: 4px;
  background: transparent;
  color: var(--editor-gutter-fg, hsl(var(--muted-foreground)));
  cursor: pointer;
  transition: background 0.1s ease;
}

.script-editor .mode-toolbar button:hover {
  background: var(--editor-border, hsl(var(--border)));
}

.script-editor .mode-toolbar button[data-active="true"] {
  background: var(--editor-fg, hsl(var(--foreground)));
  color: var(--editor-bg, hsl(var(--background)));
  border-color: transparent;
}

.find-match {
  background: rgba(255, 213, 0, 0.4);
  border-radius: 1px;
}

.find-match-current {
  background: rgba(255, 150, 0, 0.6);
  outline: 1px solid rgba(255, 120, 0, 0.8);
}

@media (prefers-color-scheme: dark) {
  .script-editor:not([data-theme="light"]) .find-match {
    background: rgba(255, 213, 0, 0.25);
  }
  .script-editor:not([data-theme="light"]) .find-match-current {
    background: rgba(255, 150, 0, 0.45);
    outline-color: rgba(255, 120, 0, 0.6);
  }
}

.script-editor[data-theme="dark"] .find-match {
  background: rgba(255, 213, 0, 0.25);
}
.script-editor[data-theme="dark"] .find-match-current {
  background: rgba(255, 150, 0, 0.45);
  outline-color: rgba(255, 120, 0, 0.6);
}

.find-bar {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--editor-bg, hsl(var(--background)));
  border-bottom: 1px solid var(--editor-border, hsl(var(--border)));
  padding: 4px 8px;
  align-items: center;
  gap: 4px;
}

.find-bar input,
.find-bar select {
  padding: 2px 6px;
  font-size: 13px;
  border: 1px solid var(--editor-border, hsl(var(--border)));
  border-radius: 4px;
  background: var(--editor-bg, hsl(var(--background)));
  color: var(--editor-fg, hsl(var(--foreground)));
}

.find-bar input { min-width: 180px; }

.find-bar button {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--editor-border, hsl(var(--border)));
  border-radius: 4px;
  background: transparent;
  color: var(--editor-fg, hsl(var(--foreground)));
  cursor: pointer;
}

.find-bar button:hover {
  background: var(--editor-border, hsl(var(--border)));
}

.find-bar .find-count {
  font-size: 12px;
  color: var(--editor-gutter-fg, hsl(var(--muted-foreground)));
  margin-left: 4px;
  white-space: nowrap;
}

.find-bar .find-close {
  margin-left: auto;
}

.scene-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0, 0, 0, 0.25);
}

.scene-palette {
  width: 440px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  background: var(--editor-bg, hsl(var(--background)));
  border: 1px solid var(--editor-border, hsl(var(--border)));
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  align-self: flex-start;
}

.scene-palette input {
  padding: 10px 14px;
  font-size: 14px;
  border: none;
  border-bottom: 1px solid var(--editor-border, hsl(var(--border)));
  background: transparent;
  color: var(--editor-fg, hsl(var(--foreground)));
  outline: none;
}

.scene-palette-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.scene-palette-list li {
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--editor-fg, hsl(var(--foreground)));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scene-palette-list li[data-selected="true"] {
  background: var(--editor-border, hsl(var(--border)));
}

.scene-palette-list li:hover {
  background: var(--editor-border, hsl(var(--border)));
}

.scene-palette-list .scene-palette-empty {
  color: var(--editor-gutter-fg, hsl(var(--muted-foreground)));
  cursor: default;
}

.scene-palette-list .scene-number {
  color: var(--editor-gutter-fg, hsl(var(--muted-foreground)));
  margin-right: 8px;
  font-size: 12px;
}
`;
