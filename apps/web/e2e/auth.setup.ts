import { expect, test } from "@playwright/test";
import { generateTotpCode } from "@felixos/auth";

const authFile = "playwright/.auth/demo.json";

test("authenticate demo tenant", async ({ page }) => {
  const secret = process.env.FELIXOS_DEMO_TOTP_SECRET;
  test.skip(!secret, "FELIXOS_DEMO_TOTP_SECRET is required for authenticated E2E");

  await page.goto("/login");
  await page.getByLabel("Code").fill(generateTotpCode(secret));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: authFile });
});
