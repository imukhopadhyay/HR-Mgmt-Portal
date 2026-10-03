import { test as setup } from "@playwright/test";
import { login } from "./helpers";

/** Sign in once per role and persist the session for the rest of the suite. */
for (const user of ["employee", "manager", "hrmanager", "hradmin"]) {
  setup(`authenticate ${user}`, async ({ page }) => {
    await login(page, `${user}@acme.test`);
    await page.context().storageState({ path: `tests/e2e/.auth/${user}.json` });
  });
}
