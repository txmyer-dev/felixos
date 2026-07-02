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
  new URL("../migrations/0001_rls_policies.sql", import.meta.url),
  new URL("../migrations/0002_knowledge_schema.sql", import.meta.url),
  new URL("../migrations/0003_knowledge_rls.sql", import.meta.url),
  new URL("../migrations/0004_agent_schema.sql", import.meta.url),
  new URL("../migrations/0005_agent_rls.sql", import.meta.url),
  new URL("../migrations/0006_n8n_schema.sql", import.meta.url),
  new URL("../migrations/0007_n8n_rls.sql", import.meta.url),
  new URL("../migrations/0008_record_agent_audit.sql", import.meta.url)
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
  rawSourceA: string;
  rawSourceB: string;
  pendingActionA: string;
  pendingActionB: string;
};

async function seedFixture(sql: Sql): Promise<Omit<RlsFixture, "sql" | "schemaName">> {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const accountA = randomUUID();
  const accountB = randomUUID();
  const contactA = randomUUID();
  const rawSourceA = randomUUID();
  const rawSourceB = randomUUID();
  const inferenceConfigA = randomUUID();
  const inferenceConfigB = randomUUID();
  const pendingActionA = randomUUID();
  const pendingActionB = randomUUID();

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
  await sql`
    INSERT INTO raw_sources (id, tenant_id, entity_id, source_type, content)
    VALUES
      (${rawSourceA}, ${tenantA}, ${accountA}, 'note', 'Tenant A raw source'),
      (${rawSourceB}, ${tenantB}, ${accountB}, 'note', 'Tenant B raw source')
  `;
  await sql`
    INSERT INTO distilled_items (
      id,
      tenant_id,
      source_id,
      entity_id,
      is_global,
      item_type,
      content,
      status,
      embedding,
      embedding_model
    )
    VALUES (
      ${randomUUID()},
      ${tenantA},
      ${rawSourceA},
      ${accountA},
      false,
      'fact',
      'Tenant A distilled item',
      'accepted',
      ${"[" + Array.from({ length: 1024 }, () => "0").join(",") + "]"}::vector,
      'test-embedding'
    )
  `;
  await sql`
    INSERT INTO tenant_inference_configs (
      id,
      tenant_id,
      provider,
      api_key_ciphertext,
      api_key_nonce,
      api_key_key_id,
      distillation_model,
      embedding_model,
      supports_tools
    )
    VALUES
      (
        ${inferenceConfigA},
        ${tenantA},
        'openai',
        'ciphertext-a',
        'nonce-a',
        'key-a',
        'gpt-a',
        'embedding-a',
        true
      ),
      (
        ${inferenceConfigB},
        ${tenantB},
        'openrouter',
        'ciphertext-b',
        'nonce-b',
        'key-b',
        'gpt-b',
        'embedding-b',
        false
      )
  `;
  await sql`
    INSERT INTO tenant_skill_rungs (tenant_id, skill_name, rung)
    VALUES
      (${tenantA}, 'draft-email', 'draft-and-wait'),
      (${tenantB}, 'draft-email', 'suggest')
  `;
  await sql`
    INSERT INTO pending_actions (id, tenant_id, skill_name, payload, status)
    VALUES
      (${pendingActionA}, ${tenantA}, 'draft-email', '{"subject":"A"}'::jsonb, 'pending'),
      (${pendingActionB}, ${tenantB}, 'draft-email', '{"subject":"B"}'::jsonb, 'pending')
  `;

  return {
    tenantA,
    tenantB,
    accountA,
    accountB,
    contactA,
    rawSourceA,
    rawSourceB,
    pendingActionA,
    pendingActionB
  };
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

    const rawSources = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ id: string; tenant_id: string }[]>`
          SELECT id, tenant_id FROM raw_sources ORDER BY id
        `
    );
    expect(rawSources).toEqual([{ id: fixture.rawSourceA, tenant_id: fixture.tenantA }]);

    const inferenceConfigs = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ tenant_id: string; distillation_model: string }[]>`
          SELECT tenant_id, distillation_model FROM tenant_inference_configs
        `
    );
    expect(inferenceConfigs).toEqual([{ tenant_id: fixture.tenantA, distillation_model: "gpt-a" }]);

    const rungs = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ tenant_id: string; rung: string }[]>`
          SELECT tenant_id, rung FROM tenant_skill_rungs
        `
    );
    expect(rungs).toEqual([{ tenant_id: fixture.tenantA, rung: "draft-and-wait" }]);

    const pendingActions = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ id: string; tenant_id: string }[]>`
          SELECT id, tenant_id FROM pending_actions
        `
    );
    expect(pendingActions).toEqual([{ id: fixture.pendingActionA, tenant_id: fixture.tenantA }]);
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

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO raw_sources (id, tenant_id, entity_id, source_type, content)
          VALUES (${randomUUID()}, ${fixture.tenantB}, ${fixture.accountB}, 'note', 'Wrong Tenant')
        `
      )
    ).rejects.toThrow();

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO distilled_items (
            id,
            tenant_id,
            source_id,
            entity_id,
            item_type,
            content
          )
          VALUES (
            ${randomUUID()},
            ${fixture.tenantA},
            ${fixture.rawSourceB},
            ${fixture.accountA},
            'fact',
            'Wrong Source Tenant'
          )
        `
      )
    ).rejects.toThrow();

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO tenant_inference_configs (
            id,
            tenant_id,
            provider,
            api_key_ciphertext,
            api_key_nonce,
            api_key_key_id,
            distillation_model,
            embedding_model
          )
          VALUES (
            ${randomUUID()},
            ${fixture.tenantB},
            'openai',
            'wrong',
            'wrong',
            'wrong',
            'wrong',
            'wrong'
          )
        `
      )
    ).rejects.toThrow();

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO tenant_skill_rungs (tenant_id, skill_name, rung)
          VALUES (${fixture.tenantB}, 'create-task', 'act-and-log')
        `
      )
    ).rejects.toThrow();

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO pending_actions (id, tenant_id, skill_name, payload)
          VALUES (${randomUUID()}, ${fixture.tenantB}, 'draft-email', '{}'::jsonb)
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

    const deletedPendingActions = await withTenantTransaction(
      fixture.sql,
      fixture.tenantA,
      () =>
        fixture.sql<{ id: string }[]>`
        DELETE FROM pending_actions
        WHERE id = ${fixture.pendingActionB}
        RETURNING id
      `
    );

    expect(deletedPendingActions).toHaveLength(0);
  });

  test("rejects embeddings with the wrong dimension count", async () => {
    await setAppRole(fixture.sql);

    await expect(
      withTenantTransaction(
        fixture.sql,
        fixture.tenantA,
        () => fixture.sql`
          INSERT INTO distilled_items (
            id,
            tenant_id,
            source_id,
            item_type,
            content,
            embedding,
            embedding_model
          )
          VALUES (
            ${randomUUID()},
            ${fixture.tenantA},
            ${fixture.rawSourceA},
            'fact',
            'Bad embedding',
            '[0,0,0]'::vector,
            'test-embedding'
          )
        `
      )
    ).rejects.toThrow();
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
