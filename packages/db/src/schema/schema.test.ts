import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { describe, expect, test } from "vitest";

const migrationUrls = [
  new URL("../../migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../../migrations/0001_rls_policies.sql", import.meta.url),
  new URL("../../migrations/0002_knowledge_schema.sql", import.meta.url),
  new URL("../../migrations/0003_knowledge_rls.sql", import.meta.url),
  new URL("../../migrations/0004_agent_schema.sql", import.meta.url),
  new URL("../../migrations/0005_agent_rls.sql", import.meta.url)
];

async function readMigration(url: URL) {
  return readFile(url, "utf8");
}

async function readMigrations() {
  return Promise.all(migrationUrls.map((url) => readMigration(url)));
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("foundation schema migration", () => {
  test("defines tenant-scoped tables and encrypted secret columns", async () => {
    const migration = await readMigration(migrationUrls[0]!);

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(migration).toContain("tenant_id uuid NOT NULL REFERENCES tenants");
    expect(migration).toContain("CREATE TABLE tenant_totp_secrets");
    expect(migration).toContain("ciphertext text NOT NULL");
    expect(migration).toContain("nonce text NOT NULL");
    expect(migration).toContain("key_id text NOT NULL");
    expect(migration).toContain("CREATE TABLE recovery_codes");
    expect(migration).toContain("code_hash text NOT NULL");
  });

  test("defines RLS policies and tenant-aware child constraints", async () => {
    const migration = await readMigration(migrationUrls[1]!);

    expect(migration).toContain("CREATE ROLE felixos_app_role NOLOGIN NOBYPASSRLS");
    expect(migration).toContain("CREATE ROLE felixos_privileged_role NOLOGIN BYPASSRLS");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting('app.current_tenant', true)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, account_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, contact_id)");
  });

  test("defines knowledge tables, vector storage, and tenant-aware constraints", async () => {
    const migration = await readMigration(migrationUrls[2]!);

    expect(migration).toContain("CREATE TYPE knowledge_source_type");
    expect(migration).toContain("CREATE TYPE distilled_item_type");
    expect(migration).toContain("CREATE TYPE distilled_item_status");
    expect(migration).toContain("CREATE TABLE raw_sources");
    expect(migration).toContain("CREATE TABLE distilled_items");
    expect(migration).toContain("embedding vector(1024)");
    expect(migration).toContain("vector_dims(embedding) = 1024");
    expect(migration).toContain("USING hnsw (embedding vector_cosine_ops)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, entity_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, source_id)");
  });

  test("defines knowledge RLS policies", async () => {
    const migration = await readMigration(migrationUrls[3]!);

    expect(migration).toContain("ALTER TABLE raw_sources ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE raw_sources FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE distilled_items ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE distilled_items FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting('app.current_tenant', true)");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
  });

  test("defines agent configuration tables and enums", async () => {
    const migration = await readMigration(migrationUrls[4]!);

    expect(migration).toContain("CREATE TYPE inference_provider");
    expect(migration).toContain("CREATE TYPE trust_rung");
    expect(migration).toContain("CREATE TYPE pending_action_status");
    expect(migration).toContain("CREATE TABLE tenant_inference_configs");
    expect(migration).toContain("CREATE TABLE tenant_skill_rungs");
    expect(migration).toContain("CREATE TABLE pending_actions");
    expect(migration).toContain("api_key_ciphertext text NOT NULL");
    expect(migration).toContain("supports_tools boolean NOT NULL DEFAULT true");
    expect(migration).toContain("PRIMARY KEY (tenant_id, skill_name)");
  });

  test("defines agent table RLS policies", async () => {
    const migration = await readMigration(migrationUrls[5]!);

    expect(migration).toContain("ALTER TABLE tenant_inference_configs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE tenant_skill_rungs FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE pending_actions FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting('app.current_tenant', true)");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
  });

  test.skipIf(!process.env.TEST_DATABASE_URL)(
    "applies to Postgres with pgvector and enforces required tenant_id columns",
    async () => {
      const databaseUrl = process.env.TEST_DATABASE_URL;

      if (!databaseUrl) {
        throw new Error("TEST_DATABASE_URL is required for this test");
      }

      const sql = postgres(databaseUrl, { max: 1 });
      const schemaName = `felixos_u3_${randomUUID().replaceAll("-", "_")}`;
      const quotedSchemaName = quoteIdentifier(schemaName);

      try {
        await sql.unsafe(`CREATE SCHEMA ${quotedSchemaName}`);
        await sql.unsafe(`SET search_path TO ${quotedSchemaName}, public`);
        for (const migration of await readMigrations()) {
          await sql.unsafe(migration);
        }

        const extensionRows = await sql<{ extname: string }[]>`
          SELECT extname FROM pg_extension WHERE extname = 'vector'
        `;
        expect(extensionRows).toHaveLength(1);

        const secretColumns = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = ${schemaName}
            AND table_name = 'tenant_totp_secrets'
        `;
        expect(secretColumns.map((row) => row.column_name)).toEqual(
          expect.arrayContaining(["ciphertext", "nonce", "key_id"])
        );

        await sql`
          INSERT INTO tenants (id, slug, name)
          VALUES (${randomUUID()}, 'tenant-a', 'Tenant A')
        `;

        await expect(sql`
          INSERT INTO entities (id, name)
          VALUES (${randomUUID()}, 'Acme Example')
        `).rejects.toThrow();

        const knowledgeTables = await sql<{ table_name: string }[]>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ${schemaName}
            AND table_name IN ('raw_sources', 'distilled_items')
          ORDER BY table_name
        `;
        expect(knowledgeTables.map((row) => row.table_name)).toEqual([
          "distilled_items",
          "raw_sources"
        ]);

        const agentTables = await sql<{ table_name: string }[]>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = ${schemaName}
            AND table_name IN (
              'tenant_inference_configs',
              'tenant_skill_rungs',
              'pending_actions'
            )
          ORDER BY table_name
        `;
        expect(agentTables.map((row) => row.table_name)).toEqual([
          "pending_actions",
          "tenant_inference_configs",
          "tenant_skill_rungs"
        ]);
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
        await sql.end({ timeout: 5 });
      }
    }
  );
});
