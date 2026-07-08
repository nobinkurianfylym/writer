import { expect, test } from "@playwright/test";
import { MOD, focusEditor, getBlocks, gotoEditor } from "./helpers.js";

/**
 * E2-2's exit test: "typing a full 2-page scene requires zero mouse
 * interactions." The only non-keyboard action anywhere in this test is
 * `focusEditor`, which calls the DOM's own `.focus()` rather than
 * `page.click()` — no `page.mouse.*` or locator `.click()` call appears
 * anywhere in this file. Every element transition below (scene heading,
 * action, character, dialogue, parenthetical, transition, back to a new
 * scene) happens via Tab/Enter/typed text alone, driven by the real
 * rendered editor exactly as a writer would use it.
 *
 * This is a structurally-representative scene (multiple scenes, multiple
 * dialogue exchanges, a parenthetical, a transition) rather than a
 * character-count-matched "exactly 2 pages" — actual pagination is
 * screenplay-core's job and is already exhaustively tested there (E1-5);
 * what this test proves is specifically that the *authoring workflow* for
 * content of that scale never needs the mouse.
 */
test("writes a multi-scene sequence using only the keyboard", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  // Scene 1
  await page.keyboard.type("int. house - kitchen - day");
  await page.keyboard.press("Enter"); // scene_heading -> action
  await page.keyboard.type("Maya pours coffee, watching the door. The kettle hisses behind her.");
  await page.keyboard.press("Enter"); // action -> action
  await page.keyboard.press("Tab"); // action -> character
  await page.keyboard.type("maya");
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("You're up early.");
  await page.keyboard.press("Enter"); // dialogue -> dialogue (new block)
  await page.keyboard.press("Tab"); // dialogue -> parenthetical
  await page.keyboard.type("not looking up");
  await page.keyboard.press("Enter"); // parenthetical -> dialogue
  await page.keyboard.type("Table's set. Sit.");
  await page.keyboard.press("Enter"); // dialogue -> dialogue (new, empty block)
  // ⌘2 explicitly switches that empty dialogue block to action (2nd in
  // EXPLICIT_SWITCH_ORDER) — the smart-type transition rule only fires on
  // action blocks, so this is the natural way to reach for a transition
  // mid-exchange without leaving an extra blank line behind.
  await page.keyboard.press(`${MOD}+2`);
  await page.keyboard.type("CUT TO:"); // smart-type: action -> transition
  await page.keyboard.press("Enter"); // transition -> scene_heading (ENTER_NON_EMPTY.transition)

  // Scene 2
  await page.keyboard.type("ext. street - continuous");
  await page.keyboard.press("Enter"); // scene_heading -> action
  await page.keyboard.type("Maya steps outside, coffee in hand, and stops cold.");
  await page.keyboard.press("Enter"); // action -> action
  await page.keyboard.press("Tab"); // action -> character
  await page.keyboard.type("maya");
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("Oh. It's you.");

  const blocks = await getBlocks(page);
  expect(blocks.map((b) => b.type)).toEqual([
    "scene_heading",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "dialogue",
    "transition",
    "scene_heading",
    "action",
    "character",
    "dialogue",
  ]);
  expect(blocks[0]?.text).toBe("INT. HOUSE - KITCHEN - DAY");
  expect(blocks[6]?.text).toBe("CUT TO:");
  expect(blocks[7]?.text).toBe("EXT. STREET - CONTINUOUS");
  expect(blocks[9]?.text).toBe("MAYA");
  expect(blocks.at(-1)?.text).toBe("Oh. It's you.");
});
