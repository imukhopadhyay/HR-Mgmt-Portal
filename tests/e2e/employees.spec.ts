import { expect, test } from "@playwright/test";
import { as } from "./helpers";

test.describe("HR manager", () => {
  test.use(as("hrmanager"));
  test("creates an employee and finds them in the directory", async ({ page }) => {
    const stamp = Date.now().toString(36);
    await page.goto("/employees/new");
    await page.getByRole("button", { name: "Create employee" }).click();
    await expect(page.getByText("First name is required")).toBeVisible();
    await page.getByLabel("First name").fill("Esha");
    await page.getByLabel("Last name").fill(`Test${stamp}`);
    await page.getByLabel("Work email").fill(`esha.${stamp}@acme.test`);
    await page.getByLabel("Department").selectOption({ label: "Engineering" });
    await page.getByLabel("Reporting manager").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Create employee" }).click();
    await expect(page).toHaveURL(/\/employees\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: `Esha Test${stamp}` })).toBeVisible();
    await page.getByRole("tab", { name: "Checklists" }).click();
    await expect(page.getByText("Provision laptop and email account")).toBeVisible();

    await page.goto("/employees");
    await page.getByLabel("Search").fill(`Test${stamp}`);
    await expect(page.getByRole("link", { name: new RegExp(`Esha Test${stamp}`) })).toBeVisible();
  });

  test("directory export downloads a CSV for HR", async ({ page }) => {
    const res = await page.request.get("/api/exports/employees?format=csv");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(await res.text()).toContain("Employee ID");
  });
});

test.describe("employee", () => {
  test.use(as("employee"));
  test("cannot see colleagues' personal data", async ({ page }) => {
    await page.goto("/employees");
    await page.getByLabel("Search").fill("Vikram");
    await page.getByRole("link", { name: /Vikram Rao/ }).click();
    await expect(page.getByRole("heading", { name: "Vikram Rao" })).toBeVisible();
    await expect(page.getByText("Date of birth")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Statutory & bank" })).toHaveCount(0);
  });
});
