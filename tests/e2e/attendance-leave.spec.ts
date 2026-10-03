import { expect, test } from "@playwright/test";
import { as } from "./helpers";

function weekdayAhead(days: number) {
  const d = new Date(Date.now() + days * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe("employee", () => {
  test.use(as("employee"));
  test("views attendance and the calendar", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "My attendance" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Attendance calendar" })).toBeVisible();
    const checkIn = page.getByRole("button", { name: "Check in" });
    const checkOut = page.getByRole("button", { name: "Check out" });
    if (await checkIn.isVisible()) {
      await checkIn.click();
      await expect(checkOut).toBeVisible();
    }
  });
});

test("employee applies for leave and the manager approves it", async ({ browser }) => {
  const emp = await browser.newContext(as("employee"));
  const page = await emp.newPage();
  // Choose a date unlikely to collide with earlier runs.
  const offset = 120 + (Math.floor(Date.now() / 1000) % 120);
  const day = weekdayAhead(offset);
  await page.goto("/leave");
  await page.getByRole("button", { name: "Apply for leave" }).click();
  const dialog = page.getByRole("dialog");
  const typeSelect = dialog.getByLabel("Leave type");
  const casual = await typeSelect
    .locator("option", { hasText: "Casual Leave" })
    .getAttribute("value");
  await typeSelect.selectOption(casual!);
  await dialog.getByLabel("From").fill(day);
  await dialog.getByLabel("To").fill(day);
  await dialog.getByLabel("Reason").fill(`E2E leave ${day}`);
  await expect(dialog.getByText(/uses\s+1\s+day/)).toBeVisible();
  await dialog.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Leave request submitted")).toBeVisible();

  const mgrCtx = await browser.newContext(as("manager"));
  const mgr = await mgrCtx.newPage();
  await mgr.goto("/approvals?tab=leave");
  const row = mgr.getByRole("row").filter({ hasText: `E2E leave ${day}` });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Approve leave/ }).click();
  await mgr.getByRole("alertdialog").getByRole("button", { name: "Approve" }).click();
  await expect(mgr.getByText("Decision recorded")).toBeVisible();
  await expect(mgr.getByRole("row").filter({ hasText: `E2E leave ${day}` })).toHaveCount(0);

  await page.goto(`/leave?year=${day.slice(0, 4)}`);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `E2E leave ${day}` })
      .getByText("Approved", { exact: true }),
  ).toBeVisible();
});

test.describe("manager", () => {
  test.use(as("manager"));
  test("rejecting requires a reason", async ({ page }) => {
    await page.goto("/approvals?tab=leave");
    const reject = page.getByRole("button", { name: /Reject leave/ }).first();
    if (await reject.count()) {
      await reject.click();
      await expect(
        page.getByRole("alertdialog").getByRole("button", { name: "Reject" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
    }
  });
});
