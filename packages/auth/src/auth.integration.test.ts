import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type DatabaseSql,
  createPrivilegedDatabaseClient,
  createSqlClient,
  createScopedDatabaseClient,
  demoAccounts,
  demoTenant,
  recoveryCodes,
  seedDemoTenant,
  sessions,
  tenantTotpSecrets
} from "@felixos/db";

import { authenticateRecoveryCode, authenticateTotp } from "./authenticate.js";
import { provisionTenant, reissueTenantEnrollment } from "./provision.js";
import { generateTotpCode } from "./totp.js";

const migrationUrls = [
  new URL("../../db/migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../../db/migrations/0001_rls_policies.sql", import.meta.url)
];

const databaseUrl = process.env.TEST_DATABASE_URL;
const appRoleName = "felixos_app_role";

type Fixture = {
  sql: DatabaseSql;
  schemaName: string;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function readMigrations(): Promise<string[]> {
  return Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
}

async function applyMigrations(sql: DatabaseSql, schemaName: string): Promise<void> {
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);

  for (const migration of await readMigrations()) {
    await sql.unsafe(migration);
  }
}

describe.skipIf(!databaseUrl)("passwordless auth and provisioning integration", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const sql = createSqlClient(databaseUrl, { max: 1, onnotice: () => undefined });
    const schemaName = `felixos_u5_u7_${randomUUID().replaceAll("-", "_")}`;
    await applyMigrations(sql, schemaName);
    fixture = { sql, schemaName };
  });

  afterEach(async () => {
    await fixture.sql`RESET ROLE`;
    await fixture.sql.unsafe(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(fixture.schemaName)} CASCADE`
    );
    await fixture.sql.end({ timeout: 5 });
  });

  test("provisions a tenant, authenticates by TOTP, rejects replay, and binds codes to tenants", async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const key = randomBytes(32);
    const privileged = createPrivilegedDatabaseClient(databaseUrl, { max: 1 });
    const scoped = createScopedDatabaseClient(databaseUrl, { max: 1 });
    await privileged.sql.unsafe(
      `SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`
    );
    await scoped.sql.unsafe(`SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`);
    await scoped.sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);

    try {
      const tenantA = await provisionTenant(privileged, {
        slug: "tenant-a",
        name: "Tenant A",
        encryptionKey: key,
        keyId: "test"
      });
      const tenantB = await provisionTenant(privileged, {
        slug: "tenant-b",
        name: "Tenant B",
        encryptionKey: key,
        keyId: "test"
      });
      const now = new Date("2026-06-29T12:00:00.000Z");
      const code = generateTotpCode(tenantA.totpSecret, { now });

      const result = await authenticateTotp(scoped, {
        tenantId: tenantA.tenantId,
        code,
        encryptionKey: key,
        now
      });

      expect(result.codeKind).toBe("totp");
      expect(result.session.tenantId).toBe(tenantA.tenantId);
      await expect(
        authenticateTotp(scoped, {
          tenantId: tenantA.tenantId,
          code,
          encryptionKey: key,
          now
        })
      ).rejects.toThrow("already been used");
      await expect(
        authenticateTotp(scoped, {
          tenantId: tenantB.tenantId,
          code,
          encryptionKey: key,
          now
        })
      ).rejects.toThrow("Invalid authentication code");
    } finally {
      await scoped.end();
      await privileged.end();
    }
  });

  test("consumes recovery codes once and reissue invalidates old enrollment material", async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const key = randomBytes(32);
    const privileged = createPrivilegedDatabaseClient(databaseUrl, { max: 1 });
    const scoped = createScopedDatabaseClient(databaseUrl, { max: 1 });
    await privileged.sql.unsafe(
      `SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`
    );
    await scoped.sql.unsafe(`SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`);
    await scoped.sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);

    try {
      const enrollment = await provisionTenant(privileged, {
        slug: "recoverable",
        name: "Recoverable Tenant",
        encryptionKey: key,
        keyId: "test"
      });
      const recoveryCode = enrollment.recoveryCodes[0]?.code;

      if (!recoveryCode) {
        throw new Error("Expected generated recovery code");
      }

      await expect(
        authenticateRecoveryCode(scoped, {
          tenantId: enrollment.tenantId,
          recoveryCode,
          now: new Date("2026-06-29T12:00:00.000Z")
        })
      ).resolves.toMatchObject({ codeKind: "recovery_code" });
      await expect(
        authenticateRecoveryCode(scoped, {
          tenantId: enrollment.tenantId,
          recoveryCode,
          now: new Date("2026-06-29T12:00:01.000Z")
        })
      ).rejects.toThrow("Invalid recovery code");

      const reissued = await reissueTenantEnrollment(privileged, {
        tenantSlug: enrollment.tenantSlug,
        encryptionKey: key,
        keyId: "test"
      });
      const oldTotpCode = generateTotpCode(enrollment.totpSecret, {
        now: new Date("2026-06-29T12:01:00.000Z")
      });
      const newTotpCode = generateTotpCode(reissued.totpSecret, {
        now: new Date("2026-06-29T12:01:00.000Z")
      });

      await expect(
        authenticateTotp(scoped, {
          tenantId: enrollment.tenantId,
          code: oldTotpCode,
          encryptionKey: key,
          now: new Date("2026-06-29T12:01:00.000Z")
        })
      ).rejects.toThrow("Invalid authentication code");
      await expect(
        authenticateRecoveryCode(scoped, {
          tenantId: enrollment.tenantId,
          recoveryCode: reissued.recoveryCodes[0]?.code ?? "",
          now: new Date("2026-06-29T12:01:00.000Z")
        })
      ).resolves.toMatchObject({ codeKind: "recovery_code" });
      await expect(
        authenticateTotp(scoped, {
          tenantId: enrollment.tenantId,
          code: newTotpCode,
          encryptionKey: key,
          now: new Date("2026-06-29T12:01:00.000Z")
        })
      ).resolves.toMatchObject({ codeKind: "totp" });
    } finally {
      await scoped.end();
      await privileged.end();
    }
  });

  test("stores encrypted secrets and hashes without logging enrollment material", async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const key = randomBytes(32);
    const privileged = createPrivilegedDatabaseClient(databaseUrl, { max: 1 });
    await privileged.sql.unsafe(
      `SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`
    );
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    const consoleLogSpy = vi.spyOn(console, "log");

    try {
      const enrollment = await provisionTenant(privileged, {
        slug: "quiet",
        name: "Quiet Tenant",
        encryptionKey: key,
        keyId: "test"
      });
      const [secretRow] = await privileged.db
        .select()
        .from(tenantTotpSecrets)
        .where(eq(tenantTotpSecrets.tenantId, enrollment.tenantId))
        .limit(1);
      const storedRecoveryCodes = await privileged.db
        .select()
        .from(recoveryCodes)
        .where(eq(recoveryCodes.tenantId, enrollment.tenantId));

      expect(secretRow?.ciphertext).not.toContain(enrollment.totpSecret);
      expect(storedRecoveryCodes.map((code) => code.codeHash)).not.toContain(
        enrollment.recoveryCodes[0]?.code
      );
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      consoleLogSpy.mockRestore();
      await privileged.end();
    }
  });

  test("seeds a dormant demo tenant idempotently with demo entity-spine data", async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const privileged = createPrivilegedDatabaseClient(databaseUrl, { max: 1 });
    await privileged.sql.unsafe(
      `SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`
    );

    try {
      await seedDemoTenant(privileged);
      await seedDemoTenant(privileged);

      const seededAccounts = await privileged.db
        .select()
        .from(sessions)
        .where(eq(sessions.tenantId, demoTenant.id));
      const [accountCountRow] = await privileged.sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM entities WHERE tenant_id = ${demoTenant.id}
      `;
      const [tenant] = await privileged.sql<
        { status: string; is_demo: boolean }[]
      >`SELECT status, is_demo FROM tenants WHERE id = ${demoTenant.id}`;

      expect(seededAccounts).toEqual([]);
      expect(Number(accountCountRow?.count ?? 0)).toBe(demoAccounts.length);
      expect(tenant).toEqual({ status: "dormant", is_demo: true });
    } finally {
      await privileged.end();
    }
  });
});
