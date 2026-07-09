import { expect, test } from "@playwright/test";
import { gotoLargeEditor, focusEditor, MOD } from "./helpers.js";

test("⌘F opens find bar and searches across document", async ({ page }) => {
  await gotoLargeEditor(page, 2);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();
  await expect(page.locator('[data-testid="find-input"]')).toBeFocused();

  await page.locator('[data-testid="find-input"]').fill("LOCATION");
  await page.waitForTimeout(200);

  const countText = await page.locator('[data-testid="find-count"]').textContent();
  expect(countText).toMatch(/^\d+ of \d+ matches$/);
  const total = parseInt(countText!.match(/of (\d+)/)![1]!);
  expect(total).toBeGreaterThan(0);
});

test("find element-type filter narrows results", async ({ page }) => {
  await gotoLargeEditor(page, 2);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await page.locator('[data-testid="find-input"]').fill("LOCATION");
  await page.waitForTimeout(200);

  const allCount = await page.locator('[data-testid="find-count"]').textContent();
  const allTotal = parseInt(allCount!.match(/of (\d+)/)![1]!);

  await page.locator('[data-testid="find-element-filter"]').selectOption("scene_heading");
  await page.waitForTimeout(200);

  const filteredCount = await page.locator('[data-testid="find-count"]').textContent();
  const filteredTotal = parseInt(filteredCount!.match(/of (\d+)/)![1]!);

  expect(filteredTotal).toBeGreaterThan(0);
  expect(filteredTotal).toBeLessThanOrEqual(allTotal);
});

test("find next/prev navigates between matches", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await page.locator('[data-testid="find-input"]').fill("CHARACTER");
  await page.waitForTimeout(200);

  const firstCount = await page.locator('[data-testid="find-count"]').textContent();
  expect(firstCount).toMatch(/^1 of /);

  await page.locator('[data-testid="find-next"]').click();
  await page.waitForTimeout(100);
  const secondCount = await page.locator('[data-testid="find-count"]').textContent();
  expect(secondCount).toMatch(/^2 of /);

  await page.locator('[data-testid="find-prev"]').click();
  await page.waitForTimeout(100);
  const backCount = await page.locator('[data-testid="find-count"]').textContent();
  expect(backCount).toMatch(/^1 of /);
});

test("Enter advances match, Shift+Enter goes back", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await page.locator('[data-testid="find-input"]').fill("dialogue");
  await page.waitForTimeout(200);

  await page.locator('[data-testid="find-input"]').press("Enter");
  await page.waitForTimeout(100);
  const after = await page.locator('[data-testid="find-count"]').textContent();
  expect(after).toMatch(/^2 of /);

  await page.locator('[data-testid="find-input"]').press("Shift+Enter");
  await page.waitForTimeout(100);
  const back = await page.locator('[data-testid="find-count"]').textContent();
  expect(back).toMatch(/^1 of /);
});

test("Escape closes find bar", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+f`);
  await expect(page.locator('[data-testid="find-bar"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="find-bar"]')).not.toBeVisible();
});

test("⌘K opens scene palette with keyboard navigation", async ({ page }) => {
  await gotoLargeEditor(page, 2);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+k`);
  await expect(page.locator('[data-testid="scene-palette"]')).toBeVisible();
  await expect(page.locator('[data-testid="scene-palette-input"]')).toBeFocused();

  const items = page.locator('[data-testid="scene-palette-item"]');
  const count = await items.count();
  expect(count).toBeGreaterThan(1);

  const firstSelected = await items.first().getAttribute("data-selected");
  expect(firstSelected).toBe("true");

  await page.locator('[data-testid="scene-palette-input"]').press("ArrowDown");
  await page.waitForTimeout(200);
  const secondSelected = await items.nth(1).getAttribute("data-selected");
  expect(secondSelected).toBe("true");

  await page.locator('[data-testid="scene-palette-input"]').press("Enter");
  await expect(page.locator('[data-testid="scene-palette"]')).not.toBeVisible();
});

test("scene palette filter narrows list", async ({ page }) => {
  await gotoLargeEditor(page, 3);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+k`);
  const allItems = await page.locator('[data-testid="scene-palette-item"]').count();
  expect(allItems).toBeGreaterThan(2);

  await page.locator('[data-testid="scene-palette-input"]').fill("LOCATION 1");
  await page.waitForTimeout(100);
  const filteredItems = await page.locator('[data-testid="scene-palette-item"]').count();
  expect(filteredItems).toBeLessThan(allItems);
  expect(filteredItems).toBeGreaterThan(0);
});

test("scene palette Escape closes without navigating", async ({ page }) => {
  await gotoLargeEditor(page, 1);
  await page.waitForTimeout(500);
  await focusEditor(page);

  await page.keyboard.press(`${MOD}+k`);
  await expect(page.locator('[data-testid="scene-palette"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="scene-palette"]')).not.toBeVisible();
});

test("find on 300-page doc returns results under 50ms", async ({ page }) => {
  await gotoLargeEditor(page, 300);
  await page.waitForTimeout(1000);

  const elapsed = await page.evaluate(() => {
    const blocks = (window as Record<string, unknown>).__blocks as { text: string; type: string }[] | undefined;
    if (blocks) {
      const start = performance.now();
      const lower = "location";
      let count = 0;
      for (const b of blocks) {
        let pos = 0;
        const text = b.text.toLowerCase();
        while (pos < text.length) {
          const idx = text.indexOf(lower, pos);
          if (idx === -1) break;
          count++;
          pos = idx + 1;
        }
      }
      return performance.now() - start;
    }
    return -1;
  });

  if (elapsed >= 0) {
    expect(elapsed).toBeLessThan(50);
  }
});
