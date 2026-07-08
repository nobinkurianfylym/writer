import type { Block, ScreenplayDocument } from "../model.js";
import { encodeEmphasis } from "./emphasis.js";

function emphasized(block: Block): string {
  return encodeEmphasis(block.text, block.marks);
}

function renderBlock(block: Block): string | null {
  switch (block.type) {
    case "title_page":
      return block.text;
    case "scene_heading":
      return `.${emphasized(block)}`;
    case "action":
    case "shot": // Fountain has no dedicated shot syntax (§8) — round-trips as forced action.
      return `!${emphasized(block)}`;
    case "character": {
      const suffix = block.attrs.dualColumn === "right" ? "^" : "";
      return `@${emphasized(block)}${suffix}`;
    }
    case "dialogue":
      return emphasized(block);
    case "parenthetical":
      return `(${emphasized(block)})`;
    case "transition":
      return `>${emphasized(block)}`;
    case "centered":
      return `>${emphasized(block)}<`;
    case "lyric":
      return emphasized(block)
        .split("\n")
        .map((line) => `~${line}`)
        .join("\n");
    case "section":
      return `# ${emphasized(block)}`;
    case "synopsis":
      return `= ${emphasized(block)}`;
    case "note":
      return `[[${emphasized(block)}]]`;
    case "page_break":
      return "===";
    case "dual_dialogue":
      // Pure structural marker; the `^` on the second character's cue is
      // what actually signals dual dialogue in Fountain, so this
      // contributes no text of its own.
      return null;
    default: {
      const _exhaustive: never = block.type;
      return _exhaustive;
    }
  }
}

/** Adjacent pairs that must have *no* blank line between them to stay in the same dialogue exchange. */
const TIGHT_PAIRS: ReadonlySet<string> = new Set([
  "character>dialogue",
  "character>parenthetical",
  "parenthetical>dialogue",
]);

/**
 * Serializes a ScreenplayDocument to Fountain markup (§8), the inverse of
 * parseFountain. Deliberately always uses *forced* element markers
 * (`.`/`@`/`!`/`>`) rather than relying on natural detection (INT./ALL
 * CAPS/"TO:"/etc.) — a block's stored text is arbitrary and can't be
 * trusted to *look* like its type, so only forcing guarantees
 * parseFountain(serializeFountain(doc)) reconstructs the same block types.
 *
 * Blocks are joined by a blank line by default (Fountain's element
 * separator) except for the specific pairs that must stay glued together
 * to remain one dialogue exchange (character->dialogue,
 * character->parenthetical, parenthetical->dialogue) — those get a single
 * newline instead. A `dual_dialogue` marker emits no text of its own; the
 * separator logic looks past it to the block before it.
 */
export function serializeFountain(doc: ScreenplayDocument): string {
  let out = "";
  let prevBlock: Block | undefined;

  for (const block of doc.blocks) {
    const rendered = renderBlock(block);
    if (rendered === null) continue;

    if (prevBlock) {
      const tight = TIGHT_PAIRS.has(`${prevBlock.type}>${block.type}`);
      out += tight ? "\n" : "\n\n";
    }
    out += rendered;
    prevBlock = block;
  }

  return out;
}
