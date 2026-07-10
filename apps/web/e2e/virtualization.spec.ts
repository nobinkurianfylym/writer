import { expect, test } from "@playwright/test";

test("5,000-page document opens in under 5 seconds (virtualized)", async ({ page }) => {
  const start = Date.now();
  await page.goto("/editor-dev?pages=5000");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor({ timeout: 10_000 });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000);
});

test("DOM node count stays bounded regardless of document length", async ({ page }) => {
  await page.goto("/editor-dev?pages=5000");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);

  const nodeCount = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="virtual-scroll-container"]');
    if (!container) return document.querySelectorAll("*").length;
    return container.querySelectorAll("*").length;
  });
  expect(nodeCount).toBeLessThan(1500);
});

test("scroll updates visible blocks without exceeding DOM budget", async ({ page }) => {
  await page.goto("/editor-dev?pages=5000");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);

  const scrollContainer = page.locator('[data-testid="virtual-scroll-container"]');

  await scrollContainer.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await page.waitForTimeout(300);

  const nodeCountMid = await scrollContainer.evaluate((el) => el.querySelectorAll("*").length);
  expect(nodeCountMid).toBeLessThan(1500);

  const blocks = await page
    .locator('[data-testid="script-editor-content"] .ProseMirror > p[data-block-type]')
    .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.length).toBeLessThan(500);
});

test("⌘F find hits off-screen matches", async ({ page }) => {
  await page.goto("/editor-dev?pages=300");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);

  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+f`);

  await page.locator('[data-testid="find-input"]').waitFor({ timeout: 2000 });
  await page.locator('[data-testid="find-input"]').fill("LOCATION 200");

  await page.waitForTimeout(500);

  const countText = await page.locator('[data-testid="find-count"]').textContent();
  expect(countText).not.toBe("No results");
});

test("keystroke-to-paint stays fast on virtualized large document", async ({ page }) => {
  await page.goto("/editor-dev?pages=300");
  await page.locator('[data-testid="script-editor-content"] .ProseMirror').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);

  await page.locator('[data-testid="script-editor-content"] .ProseMirror').focus();

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

  for (let i = 0; i < 30; i++) {
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
