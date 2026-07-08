import type { ScreenplayDocument } from "../model.js";
import type { FormatProfile } from "../format-profile.js";
import { tokenizeCharacterName } from "../smart-type.js";
import type { LayoutLine } from "./layout.js";
import type { Page, PageMap } from "./types.js";

/**
 * The character block immediately preceding this dialogue block in the
 * original document — at most one parenthetical may sit between them.
 * Returns null for a malformed document (dialogue with no preceding
 * character), in which case synthesis skips the CONT'D cue rather than
 * inventing one.
 */
function findPrecedingCharacterText(doc: ScreenplayDocument, dialogueBlockId: string): string | null {
  const idx = doc.blocks.findIndex((b) => b.id === dialogueBlockId);
  if (idx === -1) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const b = doc.blocks[i];
    if (!b) continue;
    if (b.type === "character") return b.text;
    if (b.type !== "parenthetical") return null;
  }
  return null;
}

/** "MAYA" -> "MAYA (CONT'D)"; "MAYA (V.O.)" -> "MAYA (V.O.) (CONT'D)". */
function contdCueText(characterBlockText: string, continuedText: string): string {
  const { name, extensions } = tokenizeCharacterName(characterBlockText);
  return [name, ...extensions.map((ext) => `(${ext})`), continuedText].join(" ");
}

function moreLine(blockId: string, moreText: string): LayoutLine {
  return {
    blockId,
    blockType: "parenthetical",
    lineIndexInBlock: -1,
    totalLinesInBlock: 0,
    text: moreText,
    isBlank: false,
    synthetic: true,
  };
}

function contdLine(blockId: string, text: string): LayoutLine {
  return {
    blockId,
    blockType: "character",
    lineIndexInBlock: -1,
    totalLinesInBlock: 0,
    text,
    isBlank: false,
    synthetic: true,
  };
}

/**
 * Inserts (MORE)/(CONT'D) marker lines wherever a dialogue block's lines
 * span a page boundary (the solver already reserved exactly the space these
 * need when it decided the split — see fillPages). Any other split block
 * type (action, lyric) gets no markers, matching real screenplay
 * convention: only dialogue continues across a page with a note.
 */
export function synthesizeMoreAndContd(
  doc: ScreenplayDocument,
  pageMap: PageMap,
  profile: FormatProfile,
): PageMap {
  const pages: Page[] = pageMap.pages.map((p) => ({ ...p, lines: [...p.lines] }));

  for (let i = 0; i < pages.length - 1; i++) {
    const current = pages[i];
    const next = pages[i + 1];
    if (!current || !next) continue;

    const lastLine = current.lines.at(-1);
    const firstLine = next.lines[0];
    if (!lastLine || !firstLine) continue;
    if (lastLine.blockId !== firstLine.blockId) continue;
    if (lastLine.blockType !== "dialogue") continue;

    current.lines.push(moreLine(lastLine.blockId, profile.pagination.moreText));

    const characterText = findPrecedingCharacterText(doc, firstLine.blockId);
    if (characterText) {
      next.lines.unshift(
        contdLine(firstLine.blockId, contdCueText(characterText, profile.pagination.continuedText)),
      );
    }
  }

  return { pages };
}
