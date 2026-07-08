import type { Block, BlockType, ScreenplayDocument } from "../model.js";
import { isTransitionText } from "../smart-type.js";
import { decodeEmphasis } from "./emphasis.js";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function makeBlock(type: BlockType, rawText: string): Block {
  const { text, marks } = decodeEmphasis(rawText);
  return { id: newId(), type, text, marks, attrs: {} };
}

/** A trailing `#114#`-style scene number (§8), stripped before emphasis decoding so it never contributes to the heading's own mark offsets. */
const SCENE_NUMBER_RE = /^(.*?)\s*#([^#\s][^#]*)#$/;

function makeSceneHeadingBlock(rawText: string): Block {
  const match = SCENE_NUMBER_RE.exec(rawText);
  if (!match) return makeBlock("scene_heading", rawText);
  const block = makeBlock("scene_heading", match[1] ?? "");
  block.attrs.sceneNumber = match[2];
  return block;
}

/**
 * Extracts `[[notes]]` and `/* boneyard *‍/` (both become `note` blocks — see
 * §8) out of the raw source before line-based parsing, replacing each with a
 * sentinel so its position in the document is preserved. Both can span
 * multiple lines, which the main line-oriented grammar can't express
 * directly.
 */
// A Unicode Private Use Area character -- not a control character
// (avoids eslint's no-control-regex), and reserved by the standard
// precisely for private, application-internal sentinel use like this.
// Astronomically unlikely to appear in real screenplay prose.
const SENTINEL = "\uE000";

function extractNotesAndBoneyard(source: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const capture = (_match: string, content: string) => {
    notes.push(content.trim());
    return `${SENTINEL}NOTE${notes.length - 1}${SENTINEL}`;
  };
  let result = source.replace(/\[\[([\s\S]*?)\]\]/g, capture);
  result = result.replace(/\/\*([\s\S]*?)\*\//g, capture);
  return { text: result, notes };
}

const NOTE_SENTINEL_RE = new RegExp(`^${SENTINEL}NOTE(\\d+)${SENTINEL}$`);

const SCENE_HEADING_PREFIXES = [
  "INT./EXT.",
  "EXT./INT.",
  "INT/EXT",
  "EXT/INT",
  "I/E",
  "INT.",
  "EXT.",
  "EST.",
  "INT ",
  "EXT ",
  "EST ",
];

function looksLikeSceneHeading(line: string): boolean {
  const upper = line.trim().toUpperCase();
  return SCENE_HEADING_PREFIXES.some((p) => upper.startsWith(p));
}

function looksLikeTransition(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed !== trimmed.toUpperCase()) return false;
  return isTransitionText(trimmed);
}

function looksLikeCharacterCue(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const withoutCaret = trimmed.endsWith("^") ? trimmed.slice(0, -1).trim() : trimmed;
  const withoutExtension = withoutCaret.replace(/\([^)]*\)\s*$/, "").trim();
  if (!withoutExtension) return false;
  return withoutExtension === withoutExtension.toUpperCase() && /[A-Z]/.test(withoutExtension);
}

/**
 * Fountain's title-page spec technically allows any "Key: value" line, but
 * that's indistinguishable from a transition ("CUT TO:") or ordinary prose
 * ("talking to: someone...") without one. Matching a curated list of
 * conventional keys (as most real-world parsers do) avoids that ambiguity.
 */
const TITLE_PAGE_KEYS: ReadonlySet<string> = new Set([
  "title",
  "credit",
  "author",
  "authors",
  "source",
  "draft date",
  "date",
  "contact",
  "copyright",
  "notes",
  "revision",
  "draft",
  "watermark",
  "font",
  "unit",
  "episode",
  "series",
]);

function isTitlePageKeyLine(line: string): boolean {
  const match = /^([A-Za-z][\w .'-]*):/.exec(line);
  if (!match) return false;
  return TITLE_PAGE_KEYS.has((match[1] ?? "").trim().toLowerCase());
}

/** True for any line that starts a new, single-line structural element — used to know when to stop joining consecutive lines into one action/dialogue paragraph. */
function looksLikeStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  if (NOTE_SENTINEL_RE.test(trimmed)) return true;
  if (/^={3,}$/.test(trimmed)) return true;
  if (/^#+/.test(trimmed)) return true;
  if (/^=(?!=)/.test(trimmed)) return true;
  if (trimmed.startsWith(".") && !trimmed.startsWith("..")) return true;
  if (looksLikeSceneHeading(line)) return true;
  if (/^>.*<$/.test(trimmed)) return true;
  if (trimmed.startsWith(">")) return true;
  if (looksLikeTransition(line)) return true;
  if (trimmed.startsWith("~")) return true;
  if (trimmed.startsWith("!")) return true;
  if (trimmed.startsWith("@")) return true;
  return false;
}

/**
 * Retags the block range [start, blocks.length) — the exchange that was
 * completed right before this one (tracked explicitly by the caller as
 * `lastCompletedExchangeStart`, not re-inferred from array contents, since
 * two blank-line-separated character cues can otherwise look identical to
 * one contiguous run once neither is tagged yet) — as the "left" column of
 * a dual-dialogue exchange, and inserts a `dual_dialogue` marker before it.
 * If there's nothing to pair with (a `^` on the very first cue in the
 * document, or start is out of range — malformed input), this is a no-op;
 * normalize() repairs whatever's left inconsistent downstream.
 */
function restructureAsDualDialogueLeft(blocks: Block[], start: number | null): void {
  if (start === null || start >= blocks.length) return;

  for (let k = start; k < blocks.length; k++) {
    const b = blocks[k]!;
    blocks[k] = { ...b, attrs: { ...b.attrs, dualColumn: "left" } };
  }
  blocks.splice(start, 0, { id: newId(), type: "dual_dialogue", text: "", marks: [], attrs: {} });
}

/**
 * Parses Fountain markup (§8) into a ScreenplayDocument: all standard
 * elements, forced elements (`!`, `@`, `~`, `>`, `.`), dual dialogue (`^`),
 * sections (`#`)/synopses (`=`), notes (`[[ ]]`)/boneyard (`/* *‍/`, both
 * become `note` blocks), an optional title page, and inline emphasis
 * (`*`/`**`/`***`/`_`).
 */
export function parseFountain(source: string): ScreenplayDocument {
  const { text: preprocessed, notes } = extractNotesAndBoneyard(source.replace(/\r\n/g, "\n"));
  const lines = preprocessed.split("\n");
  const blocks: Block[] = [];

  let i = 0;

  // --- Title page: Key: Value lines (+ indented continuations) up to the first blank line. ---
  const titleLines: string[] = [];
  let j = 0;
  while (j < lines.length) {
    const line = lines[j] ?? "";
    if (line.trim() === "") break;
    if (isTitlePageKeyLine(line) || (titleLines.length > 0 && /^[ \t]/.test(line))) {
      titleLines.push(line);
      j++;
    } else {
      break;
    }
  }
  if (titleLines.length > 0 && isTitlePageKeyLine(titleLines[0] ?? "")) {
    blocks.push(makeBlock("title_page", titleLines.join("\n")));
    i = j;
    while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  }

  // --- Body ---
  let inDialogue = false;
  let dialogueColumn: "left" | "right" | undefined;
  // Block index where the *currently open* (not yet blank-line-terminated)
  // dialogue exchange began, and where the most recently *completed* one
  // began — tracked explicitly rather than re-inferred from `blocks`, since
  // two separate, blank-line-separated character cues are otherwise
  // indistinguishable from one contiguous run once neither is tagged yet.
  let currentExchangeStart: number | null = null;
  let lastCompletedExchangeStart: number | null = null;

  const pushDialogueGroupBlock = (type: BlockType, rawText: string) => {
    const block = makeBlock(type, rawText);
    if (dialogueColumn) block.attrs.dualColumn = dialogueColumn;
    blocks.push(block);
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      if (currentExchangeStart !== null) lastCompletedExchangeStart = currentExchangeStart;
      currentExchangeStart = null;
      inDialogue = false;
      dialogueColumn = undefined;
      i++;
      continue;
    }

    const noteMatch = NOTE_SENTINEL_RE.exec(line.trim());
    if (noteMatch) {
      blocks.push(makeBlock("note", notes[Number(noteMatch[1])] ?? ""));
      i++;
      continue;
    }

    // While a dialogue exchange is still open (no blank line since the
    // character cue), only a parenthetical or another blank line can end
    // it — checked here, ahead of every forced-marker/structural check
    // below, so dialogue content that happens to start with one of those
    // marker characters (".", "!", "@", "#", "=", ">", "~") is never
    // misread as a new element. Real screenplays always separate distinct
    // elements with a blank line, so this never shadows a legitimate forced
    // marker — see the dual-dialogue fixtures, which all have that blank
    // line before the next cue.
    if (inDialogue && /^\(.*\)$/.test(line.trim())) {
      const trimmed = line.trim();
      pushDialogueGroupBlock("parenthetical", trimmed.slice(1, -1));
      i++;
      continue;
    }

    if (inDialogue) {
      const collected = [line];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^\(.*\)$/.test((lines[i] ?? "").trim())) {
        collected.push(lines[i] ?? "");
        i++;
      }
      pushDialogueGroupBlock("dialogue", collected.join(" ").trim());
      continue;
    }

    if (/^={3,}$/.test(line.trim())) {
      blocks.push(makeBlock("page_break", ""));
      i++;
      continue;
    }

    if (/^#+/.test(line.trim())) {
      blocks.push(makeBlock("section", line.trim().replace(/^#+\s*/, "")));
      i++;
      continue;
    }

    if (/^=(?!=)/.test(line.trim())) {
      blocks.push(makeBlock("synopsis", line.trim().replace(/^=\s*/, "")));
      i++;
      continue;
    }

    if (line.trimStart().startsWith(".") && !line.trimStart().startsWith("..")) {
      blocks.push(makeSceneHeadingBlock(line.trimStart().slice(1).trim()));
      i++;
      continue;
    }

    if (looksLikeSceneHeading(line)) {
      blocks.push(makeSceneHeadingBlock(line.trim()));
      i++;
      continue;
    }

    const centeredMatch = /^>(.*)<$/.exec(line.trim());
    if (centeredMatch) {
      blocks.push(makeBlock("centered", (centeredMatch[1] ?? "").trim()));
      i++;
      continue;
    }

    if (line.trim().startsWith(">")) {
      blocks.push(makeBlock("transition", line.trim().slice(1).trim()));
      i++;
      continue;
    }

    if (looksLikeTransition(line)) {
      blocks.push(makeBlock("transition", line.trim()));
      i++;
      continue;
    }

    if (line.trimStart().startsWith("~")) {
      const collected: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("~")) {
        collected.push((lines[i] ?? "").trimStart().slice(1).trim());
        i++;
      }
      blocks.push(makeBlock("lyric", collected.join("\n")));
      continue;
    }

    if (line.trimStart().startsWith("!")) {
      const collected = [line.trimStart().slice(1)];
      i++;
      while (i < lines.length && !looksLikeStructuralLine(lines[i] ?? "")) {
        collected.push(lines[i] ?? "");
        i++;
      }
      blocks.push(makeBlock("action", collected.join(" ").trim()));
      continue;
    }

    if (line.trimStart().startsWith("@")) {
      const rawCue = line.trimStart().slice(1).trim();
      const isDual = rawCue.endsWith("^");
      const cueText = isDual ? rawCue.slice(0, -1).trim() : rawCue;
      if (isDual) restructureAsDualDialogueLeft(blocks, lastCompletedExchangeStart);
      dialogueColumn = isDual ? "right" : undefined;
      currentExchangeStart = blocks.length;
      pushDialogueGroupBlock("character", cueText);
      inDialogue = true;
      i++;
      continue;
    }

    if (
      !inDialogue &&
      looksLikeCharacterCue(line) &&
      i + 1 < lines.length &&
      (lines[i + 1] ?? "").trim() !== ""
    ) {
      const trimmed = line.trim();
      const isDual = trimmed.endsWith("^");
      const cueText = isDual ? trimmed.slice(0, -1).trim() : trimmed;
      if (isDual) restructureAsDualDialogueLeft(blocks, lastCompletedExchangeStart);
      dialogueColumn = isDual ? "right" : undefined;
      currentExchangeStart = blocks.length;
      pushDialogueGroupBlock("character", cueText);
      inDialogue = true;
      i++;
      continue;
    }

    {
      const collected = [line];
      i++;
      while (i < lines.length && !looksLikeStructuralLine(lines[i] ?? "")) {
        collected.push(lines[i] ?? "");
        i++;
      }
      blocks.push(makeBlock("action", collected.join(" ").trim()));
      continue;
    }
  }

  return { blocks };
}
