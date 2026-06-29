import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import postgres from "postgres";
import { describe, expect, test } from "vitest";

const migrationUrl = new URL("../../migrations/0000_foundation_schema.sql", import.meta.url);

async function readMigration() {
  return readFile(migrationUrl, "utf8");
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("foundation schema migration", () => {
  test("defines tenant-scoped tables and encrypted secret columns", async () => {
    const migration = await readMigration();

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
    const migrationUrl = new URL("../../migrations/0001_rls_policies.sql", import.meta.url);
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain("CREATE ROLE felixos_app_role NOLOGIN NOBYPASSRLS");
    expect(migration).toContain("CREATE ROLE felixos_privileged_role NOLOGIN BYPASSRLS");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("current_setting('app.current_tenant', true)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, account_id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, contact_id)");
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
        await sql.unsafe(await readMigration());

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
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
        await sql.end({ timeout: 5 });
      }
    }
  );
});
