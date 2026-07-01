import { expect, test } from "@playwright/test";

test("unauthenticated app visit redirects to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
