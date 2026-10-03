import { expect, test } from "@playwright/test";
import { as } from "./helpers";

test.use(as("employee"));

test("navigation and pages work on small screens", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Leave", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My leave" })).toBeVisible();
  // No horizontal page overflow.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
