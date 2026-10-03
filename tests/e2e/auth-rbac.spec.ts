import { expect, test } from "@playwright/test";
import { as, login, logout } from "./helpers";

test("redirects anonymous users to login and preserves the target", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/login\?next=%2Femployees/);
});

test("rejects invalid credentials with a generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("employee@acme.test");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("shows validation errors on the login form", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("employee sees self-service navigation only and is blocked from admin pages", async ({
  page,
}) => {
  await login(page, "employee@acme.test");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Leave", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Payroll" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Audit trail" })).toHaveCount(0);
  for (const path of [
    "/payroll",
    "/admin/audit",
    "/admin/users",
    "/settings",
    "/analytics",
    "/approvals",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  }
  // API endpoints enforce the same rules.
  const res = await page.request.get("/api/exports/employees?format=csv");
  expect(res.status()).toBe(403);
  await logout(page);
});

test("cross-origin API mutations are rejected", async ({ request }) => {
  const res = await request.post("/api/health", { headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

test.describe("HR admin", () => {
  test.use(as("hradmin"));
  test("sees administration and an org-wide dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Organisation overview" })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit trail" })).toBeVisible();
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Integrity verified" })).toBeVisible();
  });
});
