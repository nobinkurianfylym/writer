import type { Page } from "@playwright/test";

/** Prosemirror-keymap's "Mod-" resolves to Cmd on Mac, Ctrl elsewhere — mirrored here for the ⌘1–⌘9 explicit-switch tests. */
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

export async function gotoEditor(page: Page): Promise<void> {
  await page.goto("/editor-dev");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor();
}

/** Focuses the editor via the DOM, not a mouse click — the "zero mouse interactions" tests rely on this being the only non-keyboard action taken. */
export async function focusEditor(page: Page): Promise<void> {
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').focus();
}

export interface DomBlock {
  type: string;
  text: string;
}

/**
 * Reads the live document structure straight out of the DOM (schema.ts's
 * `toDOM` tags every block with `data-block-type`) — this is what actually
 * proves a real keystroke changed the real document, not just that a
 * headless unit test's logic is correct.
 *
 * Normalizes U+00A0 (non-breaking space) back to a plain space: Chrome's
 * contentEditable substitutes NBSP for a space typed at the start/end of a
 * line to stop HTML whitespace-collapse from eating it visually — a
 * browser input-rendering quirk, not something screenplay-core's model or
 * this package's commands ever see or produce.
 */
export async function getBlocks(page: Page): Promise<DomBlock[]> {
  const raw = await page
    .locator('[data-testid="script-editor-content"] .ProseMirror > p[data-block-type]')
    .evaluateAll((nodes) => nodes.map((n) => ({ type: n.getAttribute("data-block-type") ?? "", text: n.textContent ?? "" })));
  return raw.map((b) => ({ ...b, text: b.text.replace(/\u00a0/g, " ") }));
}

/** The currently-rendered ghost-text autocomplete suggestion (E2-3), or `null` if none is showing. */
export async function getGhostText(page: Page): Promise<string | null> {
  const locator = page.locator('[data-testid="autocomplete-ghost"]');
  if ((await locator.count()) === 0) return null;
  return locator.textContent();
}
