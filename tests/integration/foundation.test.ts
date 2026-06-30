/**
 * Foundation integration test (U11)
 *
 * Verifies U5–U8 compose into a working, correctly-isolated foundation.
 * Runs against a real Postgres instance; skipped when env vars are absent.
 *
 * Requirements covered:
 *   R1 – two tenants coexist
 *   R2 – cross-tenant isolation holds end-to-end
 *   R3 – demo tenant is seeded with real data
 *   R4 – TOTP and recovery-code auth
 *   R5 – demo tenant is dormant and isolated
 *   R6/R7 – entity lifecycle advance
 */

import {
  generateTotpCode,
  provisionTenant,
  readTotpEncryptionKey,
  reissueTenantEnrollment
} from "@felixos/auth";
import {
  createPrivilegedDatabaseClient,
  createScopedDatabaseClient,
  createSqlClient,
  seedDemoTenant,
  tenants
} from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Inline buildServer to avoid a cross-package dep on apps/api
// (U11 tests the contracts, not the package boundary)
import { buildServer } from "../../apps/api/src/server.js";

const databaseUrl = process.env.DATABASE_URL;
const privilegedDatabaseUrl = process.env.DATABASE_PRIVILEGED_URL;
const rawKey = process.env.TOTP_SECRET_ENCRYPTION_KEY;
const fallbackDatabaseUrl = "postgres://unused:unused@localhost:5432/unused";
const fallbackEncryptionKey = "0000000000000000000000000000000000000000000000000000000000000000";
const appRoleName = "felixos_app_role";
const migrationUrls = [
  new URL("../../packages/db/migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../../packages/db/migrations/0001_rls_policies.sql", import.meta.url)
];

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl || !rawKey)(
  "Foundation integration (U11)",
  () => {
    const encryptionKey = readTotpEncryptionKey(rawKey ?? fallbackEncryptionKey);

    const schemaName = `felixos_u11_${randomUUID().replaceAll("-", "_")}`;
    const setupSql = createSqlClient(privilegedDatabaseUrl ?? fallbackDatabaseUrl, {
      max: 1,
      onnotice: () => undefined
    });
    const server = buildServer({
      databaseUrl: databaseUrl ?? fallbackDatabaseUrl,
      privilegedDatabaseUrl: privilegedDatabaseUrl ?? fallbackDatabaseUrl,
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
      databaseOptions: { max: 1 },
      privilegedDatabaseOptions: { max: 1 },
      logger: false
    });

    const privilegedDb = createPrivilegedDatabaseClient(
      privilegedDatabaseUrl ?? fallbackDatabaseUrl,
      { max: 1 }
    );
    const scopedDb = createScopedDatabaseClient(databaseUrl ?? fallbackDatabaseUrl, { max: 1 });

    let demoTenantId: string;

    // Tenant A – main test tenant
    let tenantAId: string;
    let tenantASlug: string;
    let tenantATotpSecret: string;
    let tenantARecoveryCodes: string[];
    let tenantACookie: string;

    // Tenant B – cross-isolation check
    let tenantBSlug: string;
    let tenantBCookie: string;

    beforeAll(async () => {
      await applyMigrations(setupSql, schemaName);
      await server.ready();
      await server.privilegedDb.sql.unsafe(
        `SET search_path TO ${quoteIdentifier(schemaName)}, public`
      );
      await server.scopedDb.sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
      await server.scopedDb.sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);
      await privilegedDb.sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
      await scopedDb.sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
      await scopedDb.sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);

      // Seed demo tenant (idempotent)
      demoTenantId = await seedDemoTenant(privilegedDb);

      // Provision tenant A
      tenantASlug = `test-foundation-a-${randomBytes(4).toString("hex")}`;
      const enrollmentA = await provisionTenant(privilegedDb, {
        slug: tenantASlug,
        name: "Foundation Test A",
        encryptionKey,
        keyId: "default"
      });
      tenantAId = enrollmentA.tenantId;
      tenantATotpSecret = enrollmentA.totpSecret;
      tenantARecoveryCodes = enrollmentA.recoveryCodes.map((r) => r.code);

      // Provision tenant B (used only for isolation check)
      tenantBSlug = `test-foundation-b-${randomBytes(4).toString("hex")}`;
      const enrollmentB = await provisionTenant(privilegedDb, {
        slug: tenantBSlug,
        name: "Foundation Test B",
        encryptionKey,
        keyId: "default"
      });

      // Login tenant B once to get a session cookie
      const codeB = generateTotpCode(enrollmentB.totpSecret);
      const loginB = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantBSlug, code: codeB }
      });
      expect(loginB.statusCode).toBe(200);
      tenantBCookie = (loginB.headers["set-cookie"] as string).split(";")[0]!;
    });

    afterAll(async () => {
      await server.close();
      await Promise.all([privilegedDb.end(), scopedDb.end()]);
      await setupSql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      await setupSql.end({ timeout: 5 });
    });

    // ─── R1: Two tenants coexist ───────────────────────────────────────────────

    it("R1: demo tenant and provisioned tenants coexist as distinct rows", async () => {
      const rows = await privilegedDb.db.select({ id: tenants.id }).from(tenants);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(demoTenantId);
      expect(ids).toContain(tenantAId);
      // They are distinct
      expect(new Set(ids).size).toBe(ids.length);
    });

    // ─── R4: TOTP authentication ───────────────────────────────────────────────

    it("R4: login with valid TOTP code succeeds and returns session cookie", async () => {
      const code = generateTotpCode(tenantATotpSecret);
      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, code }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.codeKind).toBe("totp");
      expect(body.data.session.tenantId).toBe(tenantAId);

      const cookieHeader = res.headers["set-cookie"] as string;
      expect(cookieHeader).toMatch(/felixos_session=/);
      expect(cookieHeader).toMatch(/HttpOnly/);
      expect(cookieHeader).toMatch(/SameSite=Strict/);
      tenantACookie = cookieHeader.split(";")[0]!;
    });

    it("R4: replay of the same TOTP code is rejected", async () => {
      const replaySlug = `test-foundation-replay-${randomBytes(4).toString("hex")}`;
      const replayEnrollment = await provisionTenant(privilegedDb, {
        slug: replaySlug,
        name: "Foundation Replay Test",
        encryptionKey,
        keyId: "default"
      });
      const code = generateTotpCode(replayEnrollment.totpSecret);

      // First use succeeds
      const res1 = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: replaySlug, code }
      });
      expect(res1.statusCode).toBe(200);

      // Immediate replay is rejected
      const res2 = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: replaySlug, code }
      });
      expect(res2.statusCode).toBe(401);
    });

    it("R4: login with a backup recovery code succeeds (single-use)", async () => {
      const [recoveryCode] = tenantARecoveryCodes;

      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, recoveryCode }
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.codeKind).toBe("recovery_code");

      // Second use of the same code is rejected (single-use)
      const res2 = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, recoveryCode }
      });
      expect(res2.statusCode).toBe(401);
    });

    it("R4: invalid TOTP code is rejected with 401", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, code: "000000" }
      });
      expect(res.statusCode).toBe(401);
    });

    // ─── R6/R7: Entity lifecycle ───────────────────────────────────────────────

    let entityId: string;
    let contactId: string;

    it("R6/R7: create an account as a prospect", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/entities",
        headers: { cookie: tenantACookie },
        payload: { name: "Acme Corp", lifecycleStage: "prospect" }
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.lifecycleStage).toBe("prospect");
      expect(body.data.tenantId).toBe(tenantAId);
      entityId = body.data.id;
    });

    it("R7: advance account lifecycle from prospect to client", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: `/entities/${entityId}`,
        headers: { cookie: tenantACookie },
        payload: { lifecycleStage: "client" }
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.lifecycleStage).toBe("client");
    });

    it("R6: create a contact attached to the account", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/contacts",
        headers: { cookie: tenantACookie },
        payload: { accountId: entityId, name: "Alice Smith", email: "alice@acme.test" }
      });
      expect(res.statusCode).toBe(201);
      contactId = res.json().data.id;
    });

    it("R6: create an interaction attached to the account and contact", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/interactions",
        headers: { cookie: tenantACookie },
        payload: {
          accountId: entityId,
          contactId,
          kind: "call",
          occurredAt: new Date().toISOString(),
          summary: "Introductory call with Alice"
        }
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.accountId).toBe(entityId);
    });

    // ─── R2: Cross-tenant isolation ────────────────────────────────────────────

    it("R2: tenant B cannot see tenant A entities through the API", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/entities",
        headers: { cookie: tenantBCookie }
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((e: { id: string }) => e.id);
      expect(ids).not.toContain(entityId);
    });

    it("R2: tenant B cannot fetch tenant A entity by ID", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/entities/${entityId}`,
        headers: { cookie: tenantBCookie }
      });
      // RLS makes the entity invisible — returns 404, not 403
      expect(res.statusCode).toBe(404);
    });

    it("R2: unauthenticated request is rejected", async () => {
      const res = await server.inject({ method: "GET", url: "/entities" });
      expect(res.statusCode).toBe(401);
    });

    // ─── R3/R5: Demo tenant is seeded and isolated ─────────────────────────────

    it("R3: demo tenant exists and has a dormant status", async () => {
      const [demo] = await privilegedDb.db
        .select({ status: tenants.status, isDemo: tenants.isDemo })
        .from(tenants)
        .where(eq(tenants.id, demoTenantId))
        .limit(1);

      expect(demo).toBeDefined();
      expect(demo!.isDemo).toBe(true);
      expect(demo!.status).toBe("dormant");
    });

    it("R5: demo tenant data is not visible to tenant A", async () => {
      // Tenant A should see only their own entities, not demo tenant data
      const res = await server.inject({
        method: "GET",
        url: "/entities",
        headers: { cookie: tenantACookie }
      });
      expect(res.statusCode).toBe(200);
      const rows = res.json().data as Array<{ tenantId: string }>;
      for (const row of rows) {
        expect(row.tenantId).toBe(tenantAId);
        expect(row.tenantId).not.toBe(demoTenantId);
      }
    });

    // ─── Recovery CLI re-issue ─────────────────────────────────────────────────

    it("re-issue invalidates old TOTP and recovery codes, new codes work", async () => {
      const oldCode = generateTotpCode(tenantATotpSecret);

      // Reissue the tenant's credentials
      const newEnrollment = await reissueTenantEnrollment(privilegedDb, {
        tenantSlug: tenantASlug,
        encryptionKey,
        keyId: "default"
      });

      expect(newEnrollment.totpSecret).not.toBe(tenantATotpSecret);
      expect(newEnrollment.recoveryCodes).toHaveLength(10);

      // Old TOTP code fails
      const resOld = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, code: oldCode }
      });
      expect(resOld.statusCode).toBe(401);

      // New TOTP code succeeds
      const newCode = generateTotpCode(newEnrollment.totpSecret);
      const resNew = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { tenantSlug: tenantASlug, code: newCode }
      });
      expect(resNew.statusCode).toBe(200);
    });
  }
);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function readMigrations(): Promise<string[]> {
  return Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
}

async function applyMigrations(
  sql: ReturnType<typeof createSqlClient>,
  schemaName: string
): Promise<void> {
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);

  for (const migration of await readMigrations()) {
    await sql.unsafe(migration);
  }
}
