import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Sign-in through the real form: email, Continue, then the local password.
 * The quiet "First time? Link your university account" button is never pressed,
 * so no request reaches the live Daystar portal.
 *
 * The three steps run in one browser session because the flow is sequential:
 * the administrator signs in, opens the staff side, then signs out and the
 * student signs in. One session also keeps sign-ins under the server's
 * 3-per-10-second sign-in limit.
 */

const BASE = "http://localhost:3000";

// Review accounts already in the local database. This test does not reset them.
const ADMIN_EMAIL = "school.admin230002@daystar.ac.ke";
const ADMIN_PASSWORD = "dev-staff-password";
const STUDENT_EMAIL = "borrower230001@daystar.ac.ke";
const STUDENT_PASSWORD = "walk-temp-password";

async function submitEmail(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/sign-in`);
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await submitEmail(page, email);
  await expect(page.locator("#local-password")).toBeVisible();
  await page.locator("#local-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe.serial("sign-in flow", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("the review school administrator signs in through the email form", async () => {
    await page.goto(`${BASE}/sign-in`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("The desk records who has the asset.")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText("The desk records who has the asset.")).toBeVisible();

    await submitEmail(page, ADMIN_EMAIL);

    // The link path is offered but not taken: it would call the live student portal.
    await expect(
      page.getByRole("button", { name: "First time? Link your university account" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

    await page.locator("#local-password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // /home sends a school administrator to the staff desk.
    await expect(page).toHaveURL(/\/school\/staff$/);
    await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
  });

  test("the signed-in school administrator reaches reports and the staff desk", async () => {
    await page.goto(`${BASE}/school/reports`);
    await expect(page.getByRole("heading", { name: "Department reports" })).toBeVisible();
    await expect(page.getByText(/Whole university/).first()).toBeVisible();

    await page.goto(`${BASE}/school/staff`);
    await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
  });

  test("the school administrator signs out, then the review student signs in to /home", async () => {
    // Wait for hydration, then assert the sign-out route itself accepted the request.
    await page.waitForLoadState("networkidle");
    const signOut = page.waitForResponse((response) => response.url().includes("/api/auth/sign-out"));
    await page.getByRole("button", { name: "Sign out" }).click();
    expect((await signOut).status()).toBe(200);
    await expect(page).toHaveURL(/\/sign-in$/);

    await signInAs(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await expect(page).toHaveURL(/\/home$/);

    const studentNav = page.getByRole("navigation", { name: "Student" });
    await expect(studentNav).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    const wide = await page.locator("#profile").evaluate((el) => el.getBoundingClientRect().width);
    expect(wide).toBeGreaterThan(700);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(studentNav).toBeVisible();
    await expect(studentNav.getByText("Scan", { exact: true })).toBeVisible();
    await expect(studentNav.getByText("Loans", { exact: true })).toBeVisible();
    await expect(studentNav.getByText("Profile", { exact: true })).toBeVisible();
    const narrow = await page.locator("#profile").evaluate((el) => el.getBoundingClientRect().width);
    expect(narrow).toBeLessThanOrEqual(390);

    // Scan is a label on this page, not a control.
    await expect(page.getByRole("button", { name: /scan/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /scan/i })).toHaveCount(0);
  });
});
