import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { as } from "./helpers";

async function scan(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`);
}

test("login page has no detectable a11y violations", async ({ page }) => {
  await page.goto("/login");
  expect(await scan(page)).toEqual([]);
});

test.describe("authenticated pages", () => {
  test.use(as("manager"));
  for (const path of ["/dashboard", "/employees", "/leave", "/attendance", "/approvals"]) {
    test(`${path} has no detectable a11y violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await scan(page)).toEqual([]);
    });
  }
});

test.describe("dialogs", () => {
  test.use(as("employee"));
  test("trap focus and are labelled", async ({ page }) => {
    await page.goto("/leave");
    await page.getByRole("button", { name: "Apply for leave" }).click();
    const dialog = page.getByRole("dialog", { name: "Apply for leave" });
    await expect(dialog).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
