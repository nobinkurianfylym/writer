import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Editor full-loop E2E (E6-3 accept): create a script, write 3 scenes,
 * refresh (state persists via IndexedDB/server), snapshot, export a PDF, and
 * download it. Requires the compose stack (api + worker + Postgres + Redis +
 * MinIO); skips when the api isn't reachable.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${API_URL}/health`, { timeout: 2000 })).ok();
  } catch {
    return false;
  }
}

async function editorSurface(page: Page) {
  return page.locator('[data-testid="script-editor-content"] .ProseMirror');
}

test.describe("editor", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await apiUp(request)), "api not reachable");
  });

  test("create → write 3 scenes → refresh → snapshot → export PDF → download", async ({
    page,
  }) => {
    // Register + create a project + a script.
    const email = `e2e-editor-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByLabel("Name").fill("Editor Writer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("SecureP@ss123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("New project title").fill("Feature");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("link", { name: "Open" }).click();
    await page.getByLabel("New script title").fill("Draft 1");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("link", { name: "Open in editor" }).click();

    // Editor loads.
    const surface = await editorSurface(page);
    await surface.waitFor();
    await expect(page.locator('[data-sync-status]')).toBeVisible();

    // Write 3 scene headings (Enter starts a new block each time).
    await surface.click();
    for (let i = 1; i <= 3; i++) {
      await page.keyboard.type(`INT. LOCATION ${i} - DAY`);
      await page.keyboard.press("Enter");
      await page.keyboard.type(`Action for scene ${i}.`);
      await page.keyboard.press("Enter");
    }

    // Wait for autosave to reach "Saved".
    await expect(page.locator('[data-sync-status="synced"]')).toBeVisible({
      timeout: 10_000,
    });

    // Refresh — content must persist.
    await page.reload();
    const surface2 = await editorSurface(page);
    await surface2.waitFor();
    await expect(surface2).toContainText("INT. LOCATION 1 - DAY");
    await expect(surface2).toContainText("INT. LOCATION 3 - DAY");

    // Snapshot.
    await page.getByRole("button", { name: "Snapshots" }).click();
    await page.getByRole("menuitem", { name: "Save a snapshot" }).click();
    await expect(page.getByText("Snapshot saved")).toBeVisible();

    // Export a PDF and download it.
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Export" }).click();

    const downloadLink = page.getByTestId("download-link");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);
    expect(await download.path()).toBeTruthy();
  });
});
