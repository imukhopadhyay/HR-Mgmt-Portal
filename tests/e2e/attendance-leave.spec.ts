import { expect, test, type Page } from "@playwright/test";
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
    if (await checkIn.isVisible()) {
      await checkIn.click();
      await expect(page.getByRole("button", { name: "Check out" })).toBeVisible();
    }
  });
});

/** Apply for one day of casual leave, retrying on date collisions from earlier runs. */
async function applyForLeave(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const day = weekdayAhead(20 + Math.floor(Math.random() * 60));
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
    const ok = page.getByText("Leave request submitted");
    const overlap = page.getByText(/Overlaps an existing/);
    await expect(ok.or(overlap).first()).toBeVisible();
    if (await ok.isVisible()) return day;
  }
  throw new Error("Could not find a free day for the leave request");
}

test("employee applies for leave, the manager approves it and the employee cancels it", async ({
  browser,
}) => {
  const page = await (await browser.newContext(as("employee"))).newPage();
  const day = await applyForLeave(page);

  const mgr = await (await browser.newContext(as("manager"))).newPage();
  await mgr.goto("/approvals?tab=leave");
  const row = mgr.getByRole("row").filter({ hasText: `E2E leave ${day}` });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Approve leave/ }).click();
  await mgr.getByRole("alertdialog").getByRole("button", { name: "Approve" }).click();
  await expect(mgr.getByText("Decision recorded")).toBeVisible();
  await expect(mgr.getByRole("row").filter({ hasText: `E2E leave ${day}` })).toHaveCount(0);

  await page.goto(`/leave?year=${day.slice(0, 4)}`);
  const mine = page.getByRole("row").filter({ hasText: `E2E leave ${day}` });
  await expect(mine.getByText("Approved", { exact: true })).toBeVisible();
  // Cancel to restore the balance (keeps the test repeatable).
  await mine.getByRole("button", { name: "Cancel leave" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel leave" }).click();
  await expect(mine.getByText("Cancelled", { exact: true })).toBeVisible();
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
