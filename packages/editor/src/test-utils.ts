import type { InputRule } from "prosemirror-inputrules";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";

/** Position right at the start of the Nth block's content (0-indexed), assuming a flat doc(block, block, ...) with no nesting — shared across this package's own test files. */
export function blockContentStart(doc: PMNode, blockIndex: number): number {
  let pos = 0; // start of doc's own content — the root node has no separate "enter" position of its own
  for (let i = 0; i < blockIndex; i++) pos += doc.child(i)!.nodeSize;
  return pos + 1; // enter the block itself
}

const MAX_MATCH = 500;

/**
 * `InputRule.match`/`.handler` exist at runtime (they're plain instance
 * properties — see prosemirror-inputrules' source) but are tagged
 * `@internal` and stripped from its published `.d.ts`, so TypeScript can't
 * see them through the public type. This narrow, test-only cast is the
 * documented way around that for exactly this "drive a rule headlessly"
 * use case.
 */
interface InputRuleInternals {
  match: RegExp;
  handler: (state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null;
}

function internals(rule: InputRule): InputRuleInternals {
  return rule as unknown as InputRuleInternals;
}

/**
 * Headless re-implementation of prosemirror-inputrules' own dispatch
 * algorithm (`run()` in inputrules.ts — not exported, since it's written to
 * take a real EditorView), for testing InputRule-based behavior without a
 * DOM. Types one character at a time; for each, checks every rule against
 * the pre-insertion state (matching the real handler contract: the handler
 * receives the *old* state and is responsible for inserting the matched
 * text itself), falling back to a plain insertion when no rule matches.
 */
export function typeText(state: EditorState, text: string, rules: readonly InputRule[]): EditorState {
  let current = state;
  for (const ch of text) {
    const $from = current.selection.$from;
    const textBefore =
      $from.parent.textBetween(Math.max(0, $from.parentOffset - MAX_MATCH), $from.parentOffset, undefined, "\ufffc") + ch;
    const from = current.selection.from;

    let handled = false;
    for (const rule of rules) {
      const { match: pattern, handler } = internals(rule);
      const match = pattern.exec(textBefore);
      if (!match || match[0].length < ch.length) continue;
      const startPos = from - (match[0].length - ch.length);
      const ruleTr = handler(current, match, startPos, from);
      if (ruleTr) {
        current = current.apply(ruleTr);
        handled = true;
        break;
      }
    }
    if (!handled) current = current.apply(current.tr.insertText(ch, from));
  }
  return current;
}
