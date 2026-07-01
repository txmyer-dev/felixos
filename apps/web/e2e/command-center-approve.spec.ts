import { expect, test } from "@playwright/test";

test("command-center renders operational sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Act and log" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fresh knowledge" })).toBeVisible();
});
