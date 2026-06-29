import { provisionTenant, readTotpEncryptionKey } from "@felixos/auth";
import { createPrivilegedDatabaseClient, createScopedDatabaseClient } from "@felixos/db";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "./server.js";

const databaseUrl = process.env.DATABASE_URL;
const privilegedDatabaseUrl = process.env.DATABASE_PRIVILEGED_URL;
const rawKey = process.env.TOTP_SECRET_ENCRYPTION_KEY;

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl || !rawKey)("API integration", () => {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  const server = buildServer({
    databaseUrl: databaseUrl!,
    privilegedDatabaseUrl: privilegedDatabaseUrl!,
    encryptionKey,
    logger: false
  });

  const privilegedDb = createPrivilegedDatabaseClient(privilegedDatabaseUrl!);
  const scopedDb = createScopedDatabaseClient(databaseUrl!);

  let tenantId: string;
  let totpSecret: string;
  let sessionCookie: string;

  beforeAll(async () => {
    await server.ready();

    const slug = `test-api-${randomBytes(4).toString("hex")}`;
    const enrollment = await provisionTenant(privilegedDb, { slug, name: "API Test", encryptionKey, keyId: "default" });
    tenantId = enrollment.tenantId;
    totpSecret = enrollment.totpSecret;
  });

  afterAll(async () => {
    await server.close();
    await Promise.all([privilegedDb.end(), scopedDb.end()]);
  });

  it("GET /health returns ok", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  describe("Authentication", () => {
    it("POST /auth/login rejects unknown tenant with 401", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: "does-not-exist", code: "123456" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /auth/login rejects invalid TOTP code with 401", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: (await getTenantSlug(privilegedDb, tenantId)), code: "000000" }
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /auth/login succeeds with valid TOTP code and sets cookie", async () => {
      const { generateTotpCode } = await import("@felixos/auth");
      const code = generateTotpCode(totpSecret);
      const slug = await getTenantSlug(privilegedDb, tenantId);

      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: slug, code }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.codeKind).toBe("totp");

      const cookieHeader = res.headers["set-cookie"] as string;
      expect(cookieHeader).toMatch(/felixos_session=/);
      expect(cookieHeader).toMatch(/HttpOnly/);
      sessionCookie = cookieHeader.split(";")[0]!;
    });
  });

  describe("Entity routes (authenticated)", () => {
    let entityId: string;

    it("GET /entities without auth returns 401", async () => {
      const res = await server.inject({ method: "GET", url: "/entities" });
      expect(res.statusCode).toBe(401);
    });

    it("POST /entities creates an account", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/entities",
        headers: { cookie: sessionCookie },
        payload: { name: "Acme Corp", lifecycleStage: "prospect" }
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.name).toBe("Acme Corp");
      expect(body.data.tenantId).toBe(tenantId);
      entityId = body.data.id;
    });

    it("GET /entities lists the created account", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/entities",
        headers: { cookie: sessionCookie }
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((e: { id: string }) => e.id);
      expect(ids).toContain(entityId);
    });

    it("PATCH /entities/:id advances lifecycle stage", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: `/entities/${entityId}`,
        headers: { cookie: sessionCookie },
        payload: { lifecycleStage: "client" }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.lifecycleStage).toBe("client");
    });
  });

  describe("Cross-tenant isolation", () => {
    it("entity from another tenant is not visible", async () => {
      // Create a second tenant
      const slug2 = `test-api2-${randomBytes(4).toString("hex")}`;
      const enrollment2 = await provisionTenant(privilegedDb, {
        slug: slug2,
        name: "Tenant 2",
        encryptionKey,
        keyId: "default"
      });

      // Login as tenant 2
      const { generateTotpCode } = await import("@felixos/auth");
      const code2 = generateTotpCode(enrollment2.totpSecret);
      const loginRes = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: slug2, code: code2 }
      });
      expect(loginRes.statusCode).toBe(200);
      const cookie2 = (loginRes.headers["set-cookie"] as string).split(";")[0]!;

      // Create entity as tenant 2
      const createRes = await server.inject({
        method: "POST",
        url: "/entities",
        headers: { cookie: cookie2 },
        payload: { name: "Tenant 2 Only Corp" }
      });
      expect(createRes.statusCode).toBe(201);
      const t2EntityId = createRes.json().data.id;

      // Tenant 1 should NOT see tenant 2's entity
      const listRes = await server.inject({
        method: "GET",
        url: "/entities",
        headers: { cookie: sessionCookie }
      });
      const ids = listRes.json().data.map((e: { id: string }) => e.id);
      expect(ids).not.toContain(t2EntityId);
    });
  });
});

async function getTenantSlug(
  privilegedDb: ReturnType<typeof createPrivilegedDatabaseClient>,
  tenantId: string
): Promise<string> {
  const { tenants } = await import("@felixos/db");
  const { eq } = await import("drizzle-orm");
  const [row] = await privilegedDb.db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row!.slug;
}
