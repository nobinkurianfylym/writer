import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoLargeEditor, focusEditor, MOD } from "./helpers.js";

test("editor route passes axe-core WCAG AA", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const results = await new AxeBuilder({ page })
    .include('[data-testid="script-editor"]')
    .analyze();

  const violations = results.violations.filter(
    (v) => !v.tags.includes("best-practice"),
  );

  if (violations.length > 0) {
    const summary = violations.map(
      (v) => `[${v.id}] ${v.description} (${v.nodes.length} nodes)`,
    );
    expect(violations, `axe violations:\n${summary.join("\n")}`).toHaveLength(0);
  }
});

test("editor route with find bar passes axe-core", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await page.locator('[data-testid="find-input"]').fill("LOCATION");
  await page.waitForTimeout(200);

  const results = await new AxeBuilder({ page })
    .include('[data-testid="script-editor"]')
    .analyze();

  const violations = results.violations.filter(
    (v) => !v.tags.includes("best-practice"),
  );
  expect(violations).toHaveLength(0);
});

test("editor route with scene palette passes axe-core", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+k`);
  await expect(page.locator('[data-testid="scene-palette"]')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[data-testid="scene-palette-overlay"]')
    .analyze();

  const violations = results.violations.filter(
    (v) => !v.tags.includes("best-practice"),
  );
  expect(violations).toHaveLength(0);
});

test("toolbar ARIA roles are correct", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const toolbar = page.locator('[data-testid="element-indicator"]');
  await expect(toolbar).toHaveAttribute("role", "toolbar");

  const modeGroup = page.locator('[data-testid="mode-toolbar"]');
  await expect(modeGroup).toHaveAttribute("role", "group");
  await expect(modeGroup).toHaveAttribute("aria-label", "Writing mode");
});

test("mode buttons have aria-pressed", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const normalBtn = page.locator('[data-testid="mode-normal"]');
  await expect(normalBtn).toHaveAttribute("aria-pressed", "true");

  const focusBtn = page.locator('[data-testid="mode-focus"]');
  await expect(focusBtn).toHaveAttribute("aria-pressed", "false");

  await focusBtn.click();
  await expect(focusBtn).toHaveAttribute("aria-pressed", "true");
  await expect(normalBtn).toHaveAttribute("aria-pressed", "false");
});

test("element type change announces to screen reader", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  const announcement = page.locator('[data-testid="sr-announcement"]');
  await expect(announcement).toHaveAttribute("aria-live", "polite");

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);

  const text = await announcement.textContent();
  expect(text).toMatch(/^Now editing: /);
});

test("editor content has document role", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const content = page.locator('[data-testid="script-editor-content"]');
  await expect(content).toHaveAttribute("role", "document");
  await expect(content).toHaveAttribute("aria-label", "Screenplay editor");
});

test("all interactive controls are keyboard-reachable", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);

  const dropdown = page.locator('[data-testid="element-dropdown"]');
  await dropdown.focus();
  await expect(dropdown).toBeFocused();

  const themeSelect = page.locator('[data-testid="theme-select"]');
  await themeSelect.focus();
  await expect(themeSelect).toBeFocused();

  const modeBtn = page.locator('[data-testid="mode-focus"]');
  await modeBtn.focus();
  await expect(modeBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modeBtn).toHaveAttribute("aria-pressed", "true");
});
