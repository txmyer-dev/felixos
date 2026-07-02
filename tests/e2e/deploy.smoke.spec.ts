import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import { generateTotpCode } from "@felixos/auth";

const DEMO_SECRET = process.env.FELIXOS_DEMO_TOTP_SECRET || "ORSXG5BRGIZTINJWG44DS";

test.describe("Deploy Smoke Test", () => {
  test.beforeAll(async () => {
    const composeEnv = {
      ...process.env,
      HOST_WEB_PORT: "3005",
      HOST_API_PORT: "3006",
      HOST_DB_PORT: "5434"
    };
    console.log("Booting compose stack...");
    execSync("docker compose down -v", { stdio: "inherit", env: composeEnv });
    execSync("docker compose up -d --build", { stdio: "inherit", env: composeEnv });

    console.log("Waiting for API health check...");
    let apiHealthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:3006/health");
        if (res.ok) {
          apiHealthy = true;
          break;
        }
      } catch (err: any) {
        console.log("API Fetch error:", err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!apiHealthy) {
      throw new Error("API did not become healthy in time");
    }

    console.log("Waiting for Web UI...");
    let webHealthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:3005/");
        if (res.ok) {
          webHealthy = true;
          break;
        }
      } catch (err: any) {
        console.log("Web Fetch error:", err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!webHealthy) {
      execSync("docker compose logs web", { stdio: "inherit", env: composeEnv });
      throw new Error("Web UI did not become healthy in time");
    }

    console.log("Seeding demo tenant...");
    execSync("pnpm db:seed", {
      stdio: "inherit",
      env: {
        ...process.env,
        HOST_WEB_PORT: "3005",
        HOST_API_PORT: "3006",
        HOST_DB_PORT: "5434",
        FELIXOS_DEMO_TOTP_SECRET: DEMO_SECRET,
        DATABASE_PRIVILEGED_URL:
          "postgresql://felixos_privileged:6f28eabf0517a84c892039028e0504c4@127.0.0.1:5434/felixos",
        TOTP_SECRET_ENCRYPTION_KEY:
          "2447147e34ecbe69160a5ddaebebe8c1ecf0db824e9753ac12d4dde60b87b82e"
      }
    });
  });

  test.afterAll(() => {
    console.log("Tearing down compose stack...");
    execSync("docker compose down -v", { stdio: "inherit" });
  });

  test("API health check", async ({ request }) => {
    const res = await request.get("http://127.0.0.1:3006/health");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  test("Demo tenant login and authenticated shell render", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=FelixOS")).toBeVisible();

    const totpCode = generateTotpCode(DEMO_SECRET);
    await page.fill('input[name="code"]', totpCode);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("http://127.0.0.1:3005/");
    await expect(page.locator("main")).toBeVisible();
  });
});
