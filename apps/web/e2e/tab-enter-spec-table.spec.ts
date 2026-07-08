import { expect, test } from "@playwright/test";
import { MOD, focusEditor, getBlocks, gotoEditor } from "./helpers.js";

/**
 * Scripts real keystroke sequences against the actual rendered
 * <ScriptEditor>, asserting on the live document structure (read from the
 * DOM, not from a headless model) — the E2-2 accept criterion this file
 * exists for. It's a representative sample of transition.spec.md's table,
 * not an exhaustive re-check of every (type, key, isEmpty) triple: that
 * exhaustive check already exists as a pure-function unit/property test in
 * screenplay-core (transition.test.ts) and as headless command tests in
 * packages/editor (commands.test.ts). What only a real browser can prove
 * is that actual keystrokes reach that logic — see e2e/README.md for a
 * concrete case (a smart-type rule) where a synthetic input method didn't.
 */
test.describe("Tab", () => {
  test("cycles the main sequence: action -> character -> transition -> shot -> action", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    for (const expected of ["character", "transition", "shot", "action"]) {
      await page.keyboard.press("Tab");
      const blocks = await getBlocks(page);
      expect(blocks[0]?.type).toBe(expected);
    }
  });

  test("toggles dialogue <-> parenthetical instead of the main cycle", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    await page.keyboard.press("Tab"); // action -> character
    await page.keyboard.type("MAYA");
    await page.keyboard.press("Enter"); // character (non-empty) -> new dialogue block
    expect((await getBlocks(page)).at(-1)?.type).toBe("dialogue");

    await page.keyboard.press("Tab"); // dialogue -> parenthetical
    expect((await getBlocks(page)).at(-1)?.type).toBe("parenthetical");

    await page.keyboard.press("Tab"); // parenthetical -> dialogue
    expect((await getBlocks(page)).at(-1)?.type).toBe("dialogue");
  });
});

test.describe("Enter", () => {
  test("on a non-empty character block, creates a new dialogue block", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    await page.keyboard.press("Tab"); // action -> character
    await page.keyboard.type("MAYA");
    await page.keyboard.press("Enter");

    expect((await getBlocks(page)).map((b) => b.type)).toEqual(["character", "dialogue"]);
  });

  test("on an already-empty block still creates a new block, demoted per ENTER_EMPTY", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    await page.keyboard.press("Tab"); // action -> character (empty)
    await page.keyboard.press("Enter"); // ENTER_EMPTY.character === "action"

    expect((await getBlocks(page)).map((b) => b.type)).toEqual(["character", "action"]);
  });
});

test("Backspace at block start merges into the end of the previous block", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.type("Maya enters");
  await page.keyboard.press("Enter"); // action (non-empty) -> new action block
  await page.keyboard.type(" the room");
  await page.keyboard.press("Home"); // start of this (single-line) block's content
  await page.keyboard.press("Backspace");

  const blocks = await getBlocks(page);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]?.text).toBe("Maya enters the room");
});

test(`${MOD}+3 explicitly switches to the 3rd EXPLICIT_SWITCH_ORDER type (character)`, async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`);
  expect((await getBlocks(page))[0]?.type).toBe("character");
});

test.describe("smart-type detection", () => {
  test("typing a recognized scene-heading prefix converts action to scene_heading, auto-capped", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    await page.keyboard.type("int. house - day");

    const blocks = await getBlocks(page);
    expect(blocks[0]?.type).toBe("scene_heading");
    expect(blocks[0]?.text).toBe("INT. HOUSE - DAY");
  });

  test("typing a recognized transition phrase converts action to transition", async ({ page }) => {
    await gotoEditor(page);
    await focusEditor(page);

    await page.keyboard.type("CUT TO:");

    expect((await getBlocks(page))[0]?.type).toBe("transition");
  });
});

test("auto-caps uppercases text typed into a caps element live", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press("Tab"); // action -> character
  await page.keyboard.type("maya");

  expect((await getBlocks(page))[0]?.text).toBe("MAYA");
});
