import { provisionTenant, readTotpEncryptionKey } from "@felixos/auth";
import {
  createPrivilegedDatabaseClient,
  createScopedDatabaseClient,
  createSqlClient,
  type DatabaseSql
} from "@felixos/db";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "./server.js";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const privilegedDatabaseUrl = process.env.DATABASE_PRIVILEGED_URL ?? process.env.TEST_DATABASE_URL;
const rawKey =
  process.env.TOTP_SECRET_ENCRYPTION_KEY ??
  "0000000000000000000000000000000000000000000000000000000000000000";
const migrationUrls = [
  new URL("../../../packages/db/migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0001_rls_policies.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0002_knowledge_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0003_knowledge_rls.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0004_agent_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0005_agent_rls.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0006_n8n_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0007_n8n_rls.sql", import.meta.url)
];
const appRoleName = "felixos_app_role";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function withSearchPath(databaseUrl: string, schemaName: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schemaName},public`);
  return url.toString();
}

function withCredentials(databaseUrl: string, username: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = username;
  url.password = password;
  return url.toString();
}

async function applyMigrations(sql: DatabaseSql, schemaName: string): Promise<void> {
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);

  for (const migrationUrl of migrationUrls) {
    await sql.unsafe(await readFile(migrationUrl, "utf8"));
  }
}

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl)("API integration", () => {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  const schemaName = `felixos_u6_${randomUUID().replaceAll("-", "_")}`;
  const scopedRoleName = `felixos_u6_app_${randomUUID().replaceAll("-", "_")}`;
  const scopedRolePassword = randomBytes(18).toString("base64url");
  let server: ReturnType<typeof buildServer>;
  let privilegedDb: ReturnType<typeof createPrivilegedDatabaseClient>;
  let scopedDb: ReturnType<typeof createScopedDatabaseClient>;

  let tenantId: string;
  let totpSecret: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const setupSql = createSqlClient(privilegedDatabaseUrl!, {
      max: 1,
      onnotice: () => undefined
    });
    await applyMigrations(setupSql, schemaName);
    await setupSql.unsafe(`
      CREATE ROLE ${quoteIdentifier(scopedRoleName)}
      LOGIN PASSWORD '${scopedRolePassword.replaceAll("'", "''")}'
      IN ROLE ${quoteIdentifier(appRoleName)}
      NOBYPASSRLS
    `);
    await setupSql.end({ timeout: 5 });

    const privilegedSchemaUrl = withSearchPath(privilegedDatabaseUrl!, schemaName);
    const scopedSchemaUrl = withSearchPath(
      withCredentials(databaseUrl!, scopedRoleName, scopedRolePassword),
      schemaName
    );

    server = buildServer({
      databaseUrl: scopedSchemaUrl,
      privilegedDatabaseUrl: privilegedSchemaUrl,
      encryptionKey,
      llm: {
        embeddingModel: "test-embedding",
        async distill() {
          return [];
        },
        async embed() {
          return Array.from({ length: 1024 }, () => 0);
        }
      },
      logger: false
    });
    privilegedDb = createPrivilegedDatabaseClient(privilegedSchemaUrl);
    scopedDb = createScopedDatabaseClient(scopedSchemaUrl);
    await server.ready();

    const slug = `test-api-${randomBytes(4).toString("hex")}`;
    const enrollment = await provisionTenant(privilegedDb, {
      slug,
      name: "API Test",
      encryptionKey,
      keyId: "default"
    });
    tenantId = enrollment.tenantId;
    totpSecret = enrollment.totpSecret;
  });

  afterAll(async () => {
    await server.close();
    const cleanupSql = createSqlClient(privilegedDatabaseUrl!, {
      max: 1,
      onnotice: () => undefined
    });
    await cleanupSql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await cleanupSql.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(scopedRoleName)}`);
    await cleanupSql.end({ timeout: 5 });
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
        payload: { tenantSlug: await getTenantSlug(privilegedDb, tenantId), code: "000000" }
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

  describe("Agent config routes (authenticated)", () => {
    it("PUT /agent/config upserts and GET /agent/config masks the key", async () => {
      const putRes = await server.inject({
        method: "PUT",
        url: "/agent/config",
        headers: { cookie: sessionCookie },
        payload: {
          provider: "openrouter",
          baseUrl: "https://openrouter.example.test/api/v1",
          apiKey: "secret-api-key",
          distillationModel: "openrouter/model",
          embeddingModel: "embedding-model",
          supportsTools: false
        }
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().data).toMatchObject({
        tenantId,
        provider: "openrouter",
        baseUrl: "https://openrouter.example.test/api/v1",
        distillationModel: "openrouter/model",
        embeddingModel: "embedding-model",
        supportsTools: false
      });
      expect(putRes.json().data.apiKey).not.toContain("secret-api-key");

      const getRes = await server.inject({
        method: "GET",
        url: "/agent/config",
        headers: { cookie: sessionCookie }
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.apiKey).toBe("configured");
      expect(getRes.json().data.apiKey).not.toContain("secret-api-key");
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
