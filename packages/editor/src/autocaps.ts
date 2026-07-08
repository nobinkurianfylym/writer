import type { Mark as PMMark } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { BlockType, FormatProfile } from "@fylym/screenplay-core";
import { screenplaySchema } from "./schema.js";

/**
 * Enforces `ElementStyle.caps` (E1-2) live: any text typed, pasted, or
 * otherwise inserted into a block whose format-profile entry has
 * `caps: true` (scene_heading, character, transition, shot, section in the
 * shipped Hollywood profiles — see hollywood-elements.ts, not hardcoded
 * here since a different profile could set this differently) is uppercased.
 * This is display/input behavior only: screenplay-core's Block.text is
 * never mutated to enforce caps outside of what the user actually typed
 * through this plugin.
 *
 * Implemented as `appendTransaction` rather than `handleTextInput` so it
 * catches every insertion source uniformly (typed keystrokes, paste,
 * collaborative edits) rather than only the fast keystroke path — the
 * one-transaction-later correction is imperceptible in practice.
 */
export function autoCapsPlugin(profile: FormatProfile): Plugin {
  const capsTypes = new Set<BlockType>(
    Object.entries(profile.elements)
      .filter(([, style]) => style.caps)
      .map(([type]) => type as BlockType),
  );

  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const replacements: { from: number; to: number; text: string; marks: readonly PMMark[] }[] = [];
      newState.doc.descendants((node, pos) => {
        if (!capsTypes.has(node.type.name as BlockType)) return true;
        node.forEach((child, offset) => {
          if (!child.isText) return;
          const text = child.text ?? "";
          const upper = text.toUpperCase();
          if (text !== upper) {
            replacements.push({ from: pos + 1 + offset, to: pos + 1 + offset + text.length, text: upper, marks: child.marks });
          }
        });
        return true;
      });

      if (replacements.length === 0) return null;

      const tr = newState.tr;
      for (const r of replacements) {
        const from = tr.mapping.map(r.from);
        const to = tr.mapping.map(r.to);
        tr.replaceWith(from, to, screenplaySchema.text(r.text, [...r.marks]));
      }
      return tr;
    },
  });
}
