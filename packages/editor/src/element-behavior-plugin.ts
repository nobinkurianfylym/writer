import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { inputRules } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Command, Plugin } from "prosemirror-state";
import { usFeatureProfile, type FormatProfile } from "@fylym/screenplay-core";
import { autoCapsPlugin } from "./autocaps.js";
import { EXPLICIT_SWITCH_ORDER, backspaceMergeCommand, switchElementCommand, transitionCommand } from "./commands.js";
import { smartTypeRules } from "./smart-type-rules.js";

function explicitSwitchKeymap(): Record<string, Command> {
  const map: Record<string, Command> = {};
  EXPLICIT_SWITCH_ORDER.forEach((type, i) => {
    map[`Mod-${i + 1}`] = switchElementCommand(type);
  });
  return map;
}

/**
 * The full E2-2 element-behavior bundle: Tab/Enter bound to the E1-3 state
 * machine, Backspace-at-start merging, ⌘1–⌘9 explicit element switching,
 * smart-type input rules (E1-4), and live auto-caps enforcement (E1-2's
 * `ElementStyle.caps`, read from `profile`). Registered before
 * `keymap(baseKeymap)` so our Tab/Enter/Backspace bindings take precedence,
 * falling through to ProseMirror's defaults (Delete, Mod-a, etc.) for
 * everything we don't handle ourselves.
 */
export function elementBehaviorPlugins(profile: FormatProfile = usFeatureProfile): Plugin[] {
  return [
    keymap({
      Tab: transitionCommand("Tab"),
      Enter: transitionCommand("Enter"),
      Backspace: backspaceMergeCommand,
      ...explicitSwitchKeymap(),
    }),
    keymap(baseKeymap),
    inputRules({ rules: smartTypeRules }),
    autoCapsPlugin(profile),
    history(),
    keymap({ "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
  ];
}
