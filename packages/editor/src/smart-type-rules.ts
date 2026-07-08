import { InputRule } from "prosemirror-inputrules";
import { isTransitionText, tokenizeSceneHeading } from "@fylym/screenplay-core";
import { screenplaySchema } from "./schema.js";

/**
 * An InputRule handler receives the state from *before* the triggering
 * character was inserted — `match[0]` is the full matched text (existing
 * prefix + the newly typed character), and `[start, end)` is the range in
 * the *old* document that must be replaced with it. A handler that doesn't
 * call `insertText` itself silently drops the character the user just
 * typed, since the framework hands off insertion to the handler entirely
 * once a rule matches (see prosemirror-inputrules' `run()`).
 */

/**
 * Typing a recognized scene-heading prefix ("int.", "ext.", "int./ext.",
 * "i/e") followed by a space at the very start of an `action` block
 * converts it to `scene_heading` in place, keeping what's been typed —
 * "typing `int.` at action start converts to scene heading" (E2-2).
 * Defers entirely to screenplay-core's own `tokenizeSceneHeading` for what
 * counts as a recognized prefix, rather than re-deriving that pattern here.
 */
const sceneHeadingRule = new InputRule(/^(\S+)\.\s$/, (state, match, start, end) => {
  const $from = state.selection.$from;
  if ($from.parent.type.name !== "action") return null;

  const blockContentStart = $from.before($from.depth) + 1;
  if (start !== blockContentStart) return null; // only a match starting at the block's own first character counts

  const candidate = `${match[1]}.`;
  if (tokenizeSceneHeading(candidate).sceneType === null) return null;

  const blockStart = $from.before($from.depth);
  const tr = state.tr.insertText(match[0], start, end);
  tr.setNodeMarkup(blockStart, screenplaySchema.nodes.scene_heading!, $from.parent.attrs);
  return tr;
});

/**
 * Typing a recognized transition phrase ("CUT TO:", "DISSOLVE TO:", etc.)
 * followed by the closing ":" at the start of an `action` block converts it
 * to `transition` in place. Same idea as the scene-heading rule, deferring
 * to screenplay-core's own `isTransitionText`.
 */
const transitionRule = new InputRule(/:$/, (state, match, start, end) => {
  const $from = state.selection.$from;
  if ($from.parent.type.name !== "action") return null;

  const textBeforeColon = $from.parent.textBetween(0, $from.parentOffset);
  const candidate = textBeforeColon + match[0];
  if (!isTransitionText(candidate)) return null;

  const blockStart = $from.before($from.depth);
  const tr = state.tr.insertText(match[0], start, end);
  tr.setNodeMarkup(blockStart, screenplaySchema.nodes.transition!, $from.parent.attrs);
  return tr;
});

/** Smart-type input rules (E1-4 helpers wired to real typing) — pass to ProseMirror's `inputRules({ rules: smartTypeRules })`. */
export const smartTypeRules = [sceneHeadingRule, transitionRule];
