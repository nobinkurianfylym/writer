import { expect, test } from "@playwright/test";
import { gotoLargeEditor, focusEditor } from "./helpers.js";

test("dark/light/system theme switching applies without reflow", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const initialBlocks = await page
    .locator('[data-testid="script-editor-content"] .ProseMirror > p')
    .count();

  await page.locator('[data-testid="theme-select"]').selectOption("light");
  const lightTheme = await page.locator('[data-testid="script-editor"]').getAttribute("data-theme");
  expect(lightTheme).toBe("light");

  await page.locator('[data-testid="theme-select"]').selectOption("dark");
  const darkTheme = await page.locator('[data-testid="script-editor"]').getAttribute("data-theme");
  expect(darkTheme).toBe("dark");

  await page.locator('[data-testid="theme-select"]').selectOption("system");
  const systemTheme = await page.locator('[data-testid="script-editor"]').getAttribute("data-theme");
  expect(systemTheme).toBeNull();

  const afterBlocks = await page
    .locator('[data-testid="script-editor-content"] .ProseMirror > p')
    .count();
  expect(afterBlocks).toBe(initialBlocks);
});

test("focus mode dims non-active scenes", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.locator('[data-testid="mode-focus"]').click();
  const modeAttr = await page.locator('[data-testid="script-editor"]').getAttribute("data-writing-mode");
  expect(modeAttr).toBe("focus");

  const activeScenes = await page.locator('.ProseMirror p.active-scene').count();
  expect(activeScenes).toBeGreaterThan(0);

  const allBlocks = await page.locator('.ProseMirror p[data-block-type]').count();
  expect(allBlocks).toBeGreaterThan(activeScenes);
});

test("mode switches preserve editor focus", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.type("hello");
  await page.waitForTimeout(100);

  await page.locator('[data-testid="mode-focus"]').click();
  await page.waitForTimeout(200);

  const focused = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm?.contains(document.activeElement) ?? false;
  });
  expect(focused).toBe(true);
});

test("element formatting applies correct indentation", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const sceneHeading = page.locator('.ProseMirror p[data-block-type="scene_heading"]').first();
  const dialogue = page.locator('.ProseMirror p[data-block-type="dialogue"]').first();
  const character = page.locator('.ProseMirror p[data-block-type="character"]').first();

  const sceneBox = await sceneHeading.boundingBox();
  const dialogueBox = await dialogue.boundingBox();
  const characterBox = await character.boundingBox();

  expect(sceneBox).toBeTruthy();
  expect(dialogueBox).toBeTruthy();
  expect(characterBox).toBeTruthy();

  expect(dialogueBox!.x).toBeGreaterThan(sceneBox!.x);
  expect(characterBox!.x).toBeGreaterThan(dialogueBox!.x);
});

test("scene headings render in uppercase", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const textTransform = await page.locator('.ProseMirror p[data-block-type="scene_heading"]').first()
    .evaluate((el) => getComputedStyle(el).textTransform);
  expect(textTransform).toBe("uppercase");
});

test("mode preference persists in localStorage", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  await page.locator('[data-testid="mode-focus"]').click();
  await page.locator('[data-testid="theme-select"]').selectOption("dark");

  const savedMode = await page.evaluate(() => localStorage.getItem("fylym-editor-mode"));
  expect(savedMode).toBe("focus");

  const savedTheme = await page.evaluate(() => localStorage.getItem("fylym-editor-theme"));
  expect(savedTheme).toBe("dark");
});
