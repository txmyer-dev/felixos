import { expect, test } from "@playwright/test";

test("authenticated shell exposes all Phase 5 destinations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  for (const label of ["Today", "Accounts", "Triage", "n8n", "Knowledge"]) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await page.getByRole("link", { name: "Knowledge" }).click();
  await expect(page).toHaveURL(/\/knowledge$/);
});

test("keyboard can reach sidebar links", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Today" })).toBeFocused();
});
