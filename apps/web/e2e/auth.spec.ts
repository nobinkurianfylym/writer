import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Full auth-journey E2E (E6-1 accept): register → logout → login →
 * magic link, plus the unauthenticated-deep-link redirect. Runs against the
 * compose stack — the api (:3001) and mailpit (:8025) must be up. When the
 * api isn't reachable the suite skips rather than failing, so a bare `pnpm
 * test:e2e` without the backend still goes green.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function apiUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${API_URL}/health`, { timeout: 2000 });
    return res.ok();
  } catch {
    return false;
  }
}

/** Polls mailpit for the newest message to `email` and returns its text body. */
async function latestEmailBody(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (res.ok()) {
      const data = (await res.json()) as { messages?: { ID: string }[] };
      const id = data.messages?.[0]?.ID;
      if (id) {
        const msg = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
        const body = (await msg.json()) as { Text?: string; HTML?: string };
        return body.Text ?? body.HTML ?? "";
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email arrived for ${email}`);
}

function tokenFromBody(body: string): string {
  const match = /[?&]token=([A-Za-z0-9._~-]+)/.exec(body);
  if (!match) throw new Error(`No token found in email body:\n${body}`);
  return match[1]!;
}

test.describe("auth journey", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await apiUp(request)), "api not reachable");
  });

  test("register → logout → login → magic link", async ({
    page,
    request,
  }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = "SecureP@ss123!";

    // ── Register ──
    await page.goto("/register");
    await page.getByLabel("Name").fill("E2E Writer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    // Lands on the dashboard, signed in — no verification step.
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

    // ── Logout ──
    await page.goto("/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // ── Login ──
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

    // ── Logout again, then magic link ──
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText(/Check your email/)).toBeVisible();

    const magicToken = tokenFromBody(await latestEmailBody(request, email));
    await page.goto(`/auth/magic?token=${magicToken}`);
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  });

  test("unauthenticated deep link redirects and returns after login", async ({
    page,
  }) => {
    // Seed an account via a fresh register.
    const email = `e2e-deep-${Date.now()}@example.com`;
    const password = "SecureP@ss123!";
    await page.goto("/register");
    await page.getByLabel("Name").fill("Deep Link");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

    // Log out, then hit a protected deep link.
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/?from=deeplink");
    await expect(page).toHaveURL(/\/login\?next=/);

    // Sign in — should return to the originally-requested URL.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  });
});

test.describe("auth pages accessibility", () => {
  // These pages render without the backend, so they always run — a WCAG
  // AA (no serious/critical violations) proxy for the Lighthouse a11y bar.
  for (const path of ["/login", "/register"]) {
    test(`${path} has no serious axe violations`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole("heading").first().waitFor();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    });
  }
});
