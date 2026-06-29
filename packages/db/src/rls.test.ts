import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { eq } from "drizzle-orm";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createScopedDatabaseClient } from "./client.js";
import { runWithTenantContext } from "./context.js";
import { appRoleName, privilegedRoleName, tenantScopedTables } from "./rls.js";
import { contacts, entities } from "./schema/index.js";

const migrationUrls = [
  new URL("../migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../migrations/0001_rls_policies.sql", import.meta.url)
];

const databaseUrl = process.env.TEST_DATABASE_URL;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function readMigrations() {
  return Promise.all(migrationUrls.map((url) => readFile(url, "utf8")));
}

async function applyMigrations(sql: Sql, schemaName: string) {
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);

  for (const migration of await readMigrations()) {
    await sql.unsafe(migration);
  }
}

type RlsFixture = {
  sql: Sql;
  schemaName: string;
  tenantA: string;
  tenantB: string;
  accountA: string;
  accountB: string;
  contactA: string;
};

async function seedFixture(sql: Sql): Promise<Omit<RlsFixture, "sql" | "schemaName">> {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const accountA = randomUUID();
  const accountB = randomUUID();
  const contactA = randomUUID();

  await sql`
    INSERT INTO tenants (id, slug, name)
    VALUES
      (${tenantA}, 'tenant-a', 'Tenant A'),
      (${tenantB}, 'tenant-b', 'Tenant B')
  `;
  await sql`
    INSERT INTO entities (id, tenant_id, name)
    VALUES
      (${accountA}, ${tenantA}, 'Account A'),
      (${accountB}, ${tenantB}, 'Account B')
  `;
  await sql`
    INSERT INTO contacts (id, tenant_id, account_id, name)
    VALUES (${contactA}, ${tenantA}, ${accountA}, 'Contact A')
  `;

  return { tenantA, tenantB, accountA, accountB, contactA };
}

async function setAppRole(sql: Sql) {
  await sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);
}

async function resetRole(sql: Sql) {
  await sql`RESET ROLE`;
}

async function withTenantTransaction<T>(
  sql: Sql,
  tenantId: string,
  callback: () => Promise<T>
): Promise<T> {
  await sql`BEGIN`;

  try {
    await sql`select set_config('app.current_tenant', ${tenantId}, true)`;
    const result = await callback();
    await sql`COMMIT`;
    return result;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }
}

describe.skipIf(!databaseUrl)("RLS tenant isolation", () => {
  let fixture: RlsFixture;

  beforeEach(async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required for RLS tests");
    }

    const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    const schemaName = `felixos_u4_${randomUUID().replaceAll("-", "_")}`;

    await applyMigrations(sql, schemaName);
    const seeded = await seedFixture(sql);
    fixture = { sql, schemaName, ...seeded };
  });

  afterEach(async () => {
    await resetRole(fixture.sql);
    await fixture.sql.unsafe(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(fixture.schemaName)} CASCADE`
    );
    await fixture.sql.end({ timeout: 5 });
  });

  test("enables and forces RLS on every scoped table", async () => {
    const rows = await fixture.sql<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = ${fixture.schemaName}::regnamespace
        AND relname = ANY(${tenantScopedTables})
      ORDER BY relname
    `;

    expect(rows.map((row) => row.relname).sort()).toEqual([...tenantScopedTables].sort());
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  test("defines app and privileged roles with the expected RLS bypass posture", async () => {
    const rows = await fixture.sql<{ rolname: string; rolbypassrls: boolean }[]>`
      SELECT rolname, rolbypassrls
      FROM pg_roles
      WHERE rolname IN (${appRoleName}, ${privilegedRoleName})
      ORDER BY rolname
    `;

    expect(rows).toEqual([
      { rolname: appRoleName, rolbypassrls: false },
      { rolname: privilegedRoleName, rolbypassrls: true }
    ]);
  });

  test("denies tenant-scoped reads when no tenant context is set", async () => {
    await setAppRole(fixture.sql);
    await fixture.sql`RESET app.current_tenant`;

    const rows = await fixture.sql<{ id: string }[]>`SELECT id FROM entities`;

    expect(rows).toHaveLength(0);
  });

  test("returns only the current tenant's rows", async () => {
    await setAppRole(fixture.sql);

    const rows = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () => fixture.sql<{ id: string; tenant_id: string }[]>`SELECT id, tenant_id FROM entities`
    );

    expect(rows).toEqual([{ id: fixture.accountA, tenant_id: fixture.tenantA }]);
  });

  test("does not leak stale tenant context across reused pooled connections", async () => {
    await setAppRole(fixture.sql);

    const tenantARows = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () => fixture.sql<{ id: string }[]>`SELECT id FROM entities ORDER BY id`
    );
    const tenantBRows = await withTenantTransaction(
      fixture.sql,
      fixture.tenantB,
      () => fixture.sql<{ id: string }[]>`SELECT id FROM entities ORDER BY id`
    );

    expect(tenantARows).toEqual([{ id: fixture.accountA }]);
    expect(tenantBRows).toEqual([{ id: fixture.accountB }]);
  });

  test("prevents cross-tenant writes and parent references", async () => {
    await setAppRole(fixture.sql);

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO entities (id, tenant_id, name)
          VALUES (${randomUUID()}, ${fixture.tenantB}, 'Wrong Tenant')
        `
      )
    ).rejects.toThrow();

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO contacts (id, tenant_id, account_id, name)
          VALUES (${randomUUID()}, ${fixture.tenantA}, ${fixture.accountB}, 'Wrong Parent')
        `
      )
    ).rejects.toThrow();

    const deletedRows = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ id: string }[]>`
        DELETE FROM entities
        WHERE id = ${fixture.accountB}
        RETURNING id
      `
    );

    expect(deletedRows).toHaveLength(0);
  });

  test("scoped client sets tenant context per transaction", async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL is required for RLS tests");
    }

    const client = createScopedDatabaseClient(databaseUrl, { max: 1, onnotice: () => undefined });

    try {
      await client.sql.unsafe(`SET search_path TO ${quoteIdentifier(fixture.schemaName)}, public`);
      await client.sql.unsafe(`SET ROLE ${quoteIdentifier(appRoleName)}`);

      const tenantARows = await runWithTenantContext(fixture.tenantA, () =>
        client.transaction((tx) => tx.select().from(entities).orderBy(entities.id))
      );
      const tenantBRows = await runWithTenantContext(fixture.tenantB, () =>
        client.transaction((tx) => tx.select().from(entities).orderBy(entities.id))
      );

      expect(tenantARows.map((row) => row.id)).toEqual([fixture.accountA]);
      expect(tenantBRows.map((row) => row.id)).toEqual([fixture.accountB]);

      await expect(client.transaction((tx) => tx.select().from(entities))).rejects.toThrow(
        "Tenant database context is required"
      );

      const contactRows = await runWithTenantContext(fixture.tenantA, () =>
        client.transaction((tx) =>
          tx.select().from(contacts).where(eq(contacts.id, fixture.contactA))
        )
      );
      expect(contactRows).toHaveLength(1);
    } finally {
      await client.sql`RESET ROLE`;
      await client.end();
    }
  });
});
