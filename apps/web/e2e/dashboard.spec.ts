import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Dashboard CRUD E2E (E6-2): create → rename → open → add script → trash →
 * restore, driven through the real UI against the compose stack. Skips when
 * the api isn't reachable so a backend-less `pnpm test:e2e` still passes.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiUp(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${API_URL}/health`, { timeout: 2000 })).ok();
  } catch {
    return false;
  }
}

test.describe("dashboard", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await apiUp(request)), "api not reachable");
  });

  test("create, rename, open, add script, trash, restore", async ({ page }) => {
    // Register lands on the dashboard (personal org auto-created at signup).
    const email = `e2e-dash-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByLabel("Name").fill("Dash Writer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("SecureP@ss123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("New project title")).toBeVisible();

    // Empty state teaches.
    await expect(page.getByText(/No projects yet/)).toBeVisible();

    // Create a project.
    await page.getByLabel("New project title").fill("My Feature");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("button", { name: "Rename My Feature" })).toBeVisible();

    // Rename it (optimistic).
    await page.getByRole("button", { name: "Rename My Feature" }).click();
    const renameField = page.getByLabel("New name for My Feature");
    await renameField.fill("Renamed Feature");
    await renameField.press("Enter");
    await expect(
      page.getByRole("button", { name: "Rename Renamed Feature" }),
    ).toBeVisible();

    // Open the project, add a script.
    await page.getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "Scripts" })).toBeVisible();
    await expect(page.getByText(/No scripts yet/)).toBeVisible();
    await page.getByLabel("New script title").fill("Draft 1");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("button", { name: "Rename Draft 1" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in editor" })).toBeVisible();

    // Back to dashboard, trash the project.
    await page.getByRole("link", { name: "All projects" }).click();
    await page
      .getByRole("button", { name: "Move Renamed Feature to trash" })
      .click();
    await expect(
      page.getByRole("button", { name: "Rename Renamed Feature" }),
    ).toHaveCount(0);

    // Restore from trash.
    await page.getByRole("link", { name: "Trash" }).click();
    await expect(
      page.getByRole("button", { name: "Restore Renamed Feature" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore Renamed Feature" }).click();
    await expect(
      page.getByRole("button", { name: "Restore Renamed Feature" }),
    ).toHaveCount(0);

    // It's back on the dashboard.
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(
      page.getByRole("button", { name: "Rename Renamed Feature" }),
    ).toBeVisible();
  });
});
