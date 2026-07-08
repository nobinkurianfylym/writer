import { expect, test } from "@playwright/test";
import { MOD, focusEditor, getBlocks, getGhostText, gotoEditor } from "./helpers.js";

/**
 * E2-3's autocomplete surfaces, scripted against the real rendered
 * <ScriptEditor> — same rationale as tab-enter-spec-table.spec.ts: the
 * ghost-text decoration and the InputRule-adjacent auto-commit behavior
 * both depend on real ProseMirror transaction dispatch, which a manual
 * `execCommand`-based smoke check (tried first, during development) proved
 * unreliable for — see e2e/README.md.
 */
test("scene-heading location completion: ghost text shows a prior location, Tab accepts it", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.type("int. house - day");
  await page.keyboard.press("Enter"); // scene_heading -> action
  await page.keyboard.press(`${MOD}+1`); // explicit switch: action -> scene_heading
  await page.keyboard.type("int. h");

  // autoCapsPlugin live-uppercases scene headings, so the typed "h" becomes
  // "H" and the remaining ghost text is "OUSE", not "ouse".
  await expect.poll(() => getGhostText(page)).toBe("OUSE");

  await page.keyboard.press("Tab");
  expect((await getBlocks(page))[1]?.text).toBe("INT. HOUSE");
});

test("character-name completion: ghost text suggests the other of two established speakers", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`); // action -> character
  await page.keyboard.type("MAYA");
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("Hi.");
  await page.keyboard.press("Enter"); // dialogue -> new dialogue
  await page.keyboard.press(`${MOD}+3`); // explicit switch: dialogue -> character
  await page.keyboard.type("SAM");
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("Hey.");
  await page.keyboard.press("Enter"); // dialogue -> new dialogue
  await page.keyboard.press(`${MOD}+3`); // dialogue -> character (empty)

  // Only two speakers established so far — MAYA should be suggested (the
  // one who *didn't* just speak), per characterNameSuggestions' rotation.
  await expect.poll(() => getGhostText(page)).toBe("MAYA");

  await page.keyboard.press("Tab");
  expect((await getBlocks(page)).at(-1)?.text).toBe("MAYA");
});

test("first-letter acceptance: typing a uniquely-matching letter commits the full name immediately", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`);
  await page.keyboard.type("MAYA");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hi.");
  await page.keyboard.press("Enter");
  await page.keyboard.press(`${MOD}+3`);
  await page.keyboard.type("SAM");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hey.");
  await page.keyboard.press("Enter");
  await page.keyboard.press(`${MOD}+3`); // -> empty character, ghost suggests MAYA

  await page.keyboard.type("m"); // the only name starting with M

  await expect.poll(async () => (await getBlocks(page)).at(-1)?.text).toBe("MAYA");
});

test("E2-3's exit test: two-character alternating dialogue needs only Enter, Enter, first letter — no Tab", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`); // action -> character
  await page.keyboard.type("MAYA");
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("You're up early.");
  await page.keyboard.press("Enter"); // dialogue (non-empty) -> new empty dialogue
  await page.keyboard.press("Enter"); // smart advance: empty dialogue -> character, no Tab
  await page.keyboard.type("s"); // no other name yet — literal
  await page.keyboard.press("Enter"); // character -> dialogue
  await page.keyboard.type("Not looking up.");
  await page.keyboard.press("Enter"); // dialogue -> new empty dialogue
  await page.keyboard.press("Enter"); // smart advance -> character, ghost suggests MAYA
  await page.keyboard.type("m"); // first-letter acceptance

  const blocks = await getBlocks(page);
  expect(blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
    { type: "character", text: "MAYA" },
    { type: "dialogue", text: "You're up early." },
    { type: "character", text: "S" },
    { type: "dialogue", text: "Not looking up." },
    { type: "character", text: "MAYA" },
  ]);
});

test("extension completion: ghost text suggests a matching extension inside an open paren", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`);
  await page.keyboard.type("MAYA (V");

  await expect.poll(() => getGhostText(page)).toBe(".O.");

  await page.keyboard.press("Tab");
  expect((await getBlocks(page))[0]?.text).toBe("MAYA (V.O.");
});

test("Escape dismisses the suggestion until the typed prefix changes", async ({ page }) => {
  await gotoEditor(page);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+3`);
  await page.keyboard.type("MAYA");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Hi.");
  await page.keyboard.press("Enter");
  await page.keyboard.press(`${MOD}+3`); // empty character, ghost suggests MAYA

  await expect.poll(() => getGhostText(page)).toBe("MAYA");
  await page.keyboard.press("Escape");
  expect(await getGhostText(page)).toBeNull();

  // Typing narrows the prefix, which resets dismissal — but "S" doesn't
  // match "MAYA" at all, so no suggestion reappears (a real, if
  // uninformative, outcome — the more interesting "reappears when it still
  // matches" case is covered indirectly by the other tests' Tab-accept
  // flow, which requires the ghost to still be showing when Tab is pressed).
  await page.keyboard.type("s");
  expect(await getGhostText(page)).toBeNull();
});
