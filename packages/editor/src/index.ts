import { BLOCK_TYPES, normalize, type ScreenplayDocument } from "@fylym/screenplay-core";

/**
 * ProseMirror <ScriptEditor> lands here in Epic E2. This placeholder proves
 * the cross-package boundary against screenplay-core ahead of that work.
 */
export const EDITOR_PACKAGE_VERSION = "0.0.0";
export const SUPPORTED_BLOCK_TYPES = BLOCK_TYPES;

export function normalizeForEditor(doc: ScreenplayDocument): ScreenplayDocument {
  return normalize(doc);
}
