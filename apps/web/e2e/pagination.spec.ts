import { expect, test } from "@playwright/test";
import { focusEditor, getPageBreaks, gotoLargeEditor } from "./helpers.js";

test("page-break decorations appear for a multi-page document", async ({ page }) => {
  await gotoLargeEditor(page, 3);

  await expect.poll(() => getPageBreaks(page).then((b) => b.length), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  const breaks = await getPageBreaks(page);
  expect(breaks[0]!.page).toBe(2);
  expect(breaks[1]!.page).toBe(3);
});

test("page-break decorations update after typing", async ({ page }) => {
  await gotoLargeEditor(page, 3);
  await expect.poll(() => getPageBreaks(page).then((b) => b.length), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  const breaksBefore = await getPageBreaks(page);

  await focusEditor(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(300);
  const breaksAfter = await getPageBreaks(page);
  expect(breaksAfter.length).toBeGreaterThanOrEqual(breaksBefore.length);
});

test("editor works without a pagination worker (graceful degradation)", async ({ page }) => {
  await page.goto("/editor-dev");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor();

  await focusEditor(page);
  await page.keyboard.type("Typing without pagination worker");

  const blocks = await page
    .locator('[data-testid="script-editor-content"] .ProseMirror > p[data-block-type]')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
  const hasText = blocks.some((b) => b.includes("Typing without pagination worker"));
  expect(hasText).toBe(true);
});

test("keystroke-to-paint p95 under two frames on a 120-page document while paginating", async ({ page }) => {
  await gotoLargeEditor(page, 120);
  await expect.poll(() => getPageBreaks(page).then((b) => b.length), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);

  await focusEditor(page);

  await page.evaluate(() => {
    const timings: number[] = [];
    Object.defineProperty(window, "__perfTimings", { value: timings, writable: false });
    document.addEventListener("keydown", () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        timings.push(performance.now() - start);
      });
    });
  });

  for (let i = 0; i < 50; i++) {
    await page.keyboard.press("a");
  }

  await page.waitForTimeout(300);

  const timings = await page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__perfTimings as number[],
  );
  expect(timings.length).toBeGreaterThan(0);

  const sorted = [...timings].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index]!;
  expect(p95).toBeLessThan(32);
});
