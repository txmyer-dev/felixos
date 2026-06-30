import { generateTotpCode, provisionTenant, readTotpEncryptionKey } from "@felixos/auth";
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

import type { LlmShim } from "./lib/llm.js";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const privilegedDatabaseUrl = process.env.DATABASE_PRIVILEGED_URL ?? process.env.TEST_DATABASE_URL;
const rawKey =
  process.env.TOTP_SECRET_ENCRYPTION_KEY ??
  "0000000000000000000000000000000000000000000000000000000000000000";
const migrationUrls = [
  new URL("../../../packages/db/migrations/0000_foundation_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0001_rls_policies.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0002_knowledge_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0003_knowledge_rls.sql", import.meta.url)
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

function makeEmbedding(seed: number): number[] {
  const embedding = Array.from({ length: 1024 }, () => 0);
  embedding[0] = seed;
  return embedding;
}

function createStubLlm(): LlmShim & { distillCalls: number; embedCalls: number } {
  return {
    distillCalls: 0,
    embedCalls: 0,
    embeddingModel: "test-embedding",
    async distill() {
      this.distillCalls += 1;
      return [{ type: "fact", content: "stub fact" }];
    },
    async embed() {
      this.embedCalls += 1;
      return makeEmbedding(1);
    }
  };
}

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl)("Knowledge API integration", () => {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  const schemaName = `felixos_knowledge_${randomUUID().replaceAll("-", "_")}`;
  const scopedRoleName = `felixos_knowledge_app_${randomUUID().replaceAll("-", "_")}`;
  const scopedRolePassword = randomBytes(18).toString("base64url");
  const llm = createStubLlm();
  let server: ReturnType<typeof buildServer>;
  let privilegedDb: ReturnType<typeof createPrivilegedDatabaseClient>;
  let scopedDb: ReturnType<typeof createScopedDatabaseClient>;
  let tenantACookie: string;
  let tenantBCookie: string;
  let tenantAEntityId: string;

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
      llm,
      logger: false
    });
    privilegedDb = createPrivilegedDatabaseClient(privilegedSchemaUrl);
    scopedDb = createScopedDatabaseClient(scopedSchemaUrl);
    await server.ready();

    tenantACookie = await provisionAndLogin("knowledge-a");
    tenantBCookie = await provisionAndLogin("knowledge-b");

    const createEntity = await server.inject({
      method: "POST",
      url: "/entities",
      headers: { cookie: tenantACookie },
      payload: { name: "Acme Knowledge", lifecycleStage: "prospect" }
    });
    expect(createEntity.statusCode).toBe(201);
    tenantAEntityId = createEntity.json().data.id;
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

  it("rejects unauthenticated knowledge requests", async () => {
    for (const request of [
      { method: "GET", url: "/knowledge/sources" },
      { method: "POST", url: "/knowledge/sources", payload: {} },
      { method: "POST", url: `/knowledge/distill/${randomUUID()}` },
      { method: "GET", url: "/knowledge/search?q=stub" },
      { method: "PATCH", url: `/knowledge/items/${randomUUID()}`, payload: {} }
    ] as const) {
      const res = await server.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it("creates, distills, accepts, and retrieves an entity-scoped source with citation", async () => {
    const sourceRes = await server.inject({
      method: "POST",
      url: "/knowledge/sources",
      headers: { cookie: tenantACookie },
      payload: {
        sourceType: "note",
        content: "Acme wants managed backup coverage.",
        entityId: tenantAEntityId,
        metadata: { title: "Discovery note" }
      }
    });
    expect(sourceRes.statusCode).toBe(201);
    const source = sourceRes.json().data;

    const distillRes = await server.inject({
      method: "POST",
      url: `/knowledge/distill/${source.id}`,
      headers: { cookie: tenantACookie }
    });
    expect(distillRes.statusCode).toBe(201);
    const item = distillRes.json().data[0];
    expect(item.status).toBe("pending");
    expect(item.sourceId).toBe(source.id);

    const hiddenSearch = await server.inject({
      method: "GET",
      url: "/knowledge/search?q=stub",
      headers: { cookie: tenantACookie }
    });
    expect(hiddenSearch.statusCode).toBe(200);
    expect(hiddenSearch.json().data).toEqual([]);

    const acceptRes = await server.inject({
      method: "PATCH",
      url: `/knowledge/items/${item.id}`,
      headers: { cookie: tenantACookie },
      payload: { status: "accepted" }
    });
    expect(acceptRes.statusCode).toBe(200);

    const searchRes = await server.inject({
      method: "GET",
      url: `/knowledge/search?q=stub&entityId=${tenantAEntityId}`,
      headers: { cookie: tenantACookie }
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().data).toMatchObject([
      {
        id: item.id,
        content: "stub fact",
        source: { id: source.id, sourceType: "note", metadata: { title: "Discovery note" } }
      }
    ]);
  });

  it("is idempotent unless force=true is supplied", async () => {
    const sourceRes = await server.inject({
      method: "POST",
      url: "/knowledge/sources",
      headers: { cookie: tenantACookie },
      payload: { sourceType: "note", content: "Idempotent source." }
    });
    const sourceId = sourceRes.json().data.id;
    const before = llm.distillCalls;

    expect(
      (
        await server.inject({
          method: "POST",
          url: `/knowledge/distill/${sourceId}`,
          headers: { cookie: tenantACookie }
        })
      ).statusCode
    ).toBe(201);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `/knowledge/distill/${sourceId}`,
          headers: { cookie: tenantACookie }
        })
      ).statusCode
    ).toBe(200);
    expect(llm.distillCalls).toBe(before + 1);

    expect(
      (
        await server.inject({
          method: "POST",
          url: `/knowledge/distill/${sourceId}?force=true`,
          headers: { cookie: tenantACookie }
        })
      ).statusCode
    ).toBe(201);
    expect(llm.distillCalls).toBe(before + 2);
  });

  it("filters rejected items and returns corrected text", async () => {
    const { itemId } = await createAcceptedGlobalItem("A correction source.");

    const rejectRes = await server.inject({
      method: "PATCH",
      url: `/knowledge/items/${itemId}`,
      headers: { cookie: tenantACookie },
      payload: { status: "rejected" }
    });
    expect(rejectRes.statusCode).toBe(200);

    const rejectedSearch = await server.inject({
      method: "GET",
      url: "/knowledge/search?q=stub&globalOnly=true",
      headers: { cookie: tenantACookie }
    });
    expect(rejectedSearch.json().data.map((item: { id: string }) => item.id)).not.toContain(itemId);

    const corrected = await createAcceptedGlobalItem("A corrected source.");
    const correctionRes = await server.inject({
      method: "PATCH",
      url: `/knowledge/items/${corrected.itemId}`,
      headers: { cookie: tenantACookie },
      payload: { status: "corrected", correctionText: "corrected fact" }
    });
    expect(correctionRes.statusCode).toBe(200);

    const correctedSearch = await server.inject({
      method: "GET",
      url: "/knowledge/search?q=stub&globalOnly=true",
      headers: { cookie: tenantACookie }
    });
    expect(correctedSearch.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: corrected.itemId,
          content: "corrected fact",
          correctionText: "corrected fact"
        })
      ])
    );
  });

  it("keeps tenant B away from tenant A knowledge", async () => {
    const { sourceId, itemId } = await createAcceptedGlobalItem("Tenant A only.");

    const listRes = await server.inject({
      method: "GET",
      url: "/knowledge/sources",
      headers: { cookie: tenantBCookie }
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.map((source: { id: string }) => source.id)).not.toContain(sourceId);

    const searchRes = await server.inject({
      method: "GET",
      url: "/knowledge/search?q=stub&globalOnly=true",
      headers: { cookie: tenantBCookie }
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().data.map((item: { id: string }) => item.id)).not.toContain(itemId);

    const patchRes = await server.inject({
      method: "PATCH",
      url: `/knowledge/items/${itemId}`,
      headers: { cookie: tenantBCookie },
      payload: { status: "rejected" }
    });
    expect(patchRes.statusCode).toBe(404);
  });

  it("validates request shapes", async () => {
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/knowledge/sources",
          headers: { cookie: tenantACookie },
          payload: { sourceType: "bad", content: "x" }
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "GET",
          url: "/knowledge/search",
          headers: { cookie: tenantACookie }
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/knowledge/search?q=x&entityId=${tenantAEntityId}&globalOnly=true`,
          headers: { cookie: tenantACookie }
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: "PATCH",
          url: `/knowledge/items/${randomUUID()}`,
          headers: { cookie: tenantACookie },
          payload: { status: "corrected" }
        })
      ).statusCode
    ).toBe(400);
  });

  async function provisionAndLogin(slugPrefix: string): Promise<string> {
    const slug = `${slugPrefix}-${randomBytes(4).toString("hex")}`;
    const enrollment = await provisionTenant(privilegedDb, {
      slug,
      name: slug,
      encryptionKey,
      keyId: "default"
    });
    const loginRes = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tenantSlug: slug, code: generateTotpCode(enrollment.totpSecret) }
    });
    expect(loginRes.statusCode).toBe(200);
    return (loginRes.headers["set-cookie"] as string).split(";")[0]!;
  }

  async function createAcceptedGlobalItem(
    content: string
  ): Promise<{ sourceId: string; itemId: string }> {
    const sourceRes = await server.inject({
      method: "POST",
      url: "/knowledge/sources",
      headers: { cookie: tenantACookie },
      payload: { sourceType: "note", content }
    });
    const sourceId = sourceRes.json().data.id;
    const distillRes = await server.inject({
      method: "POST",
      url: `/knowledge/distill/${sourceId}`,
      headers: { cookie: tenantACookie }
    });
    const itemId = distillRes.json().data[0].id;
    const acceptRes = await server.inject({
      method: "PATCH",
      url: `/knowledge/items/${itemId}`,
      headers: { cookie: tenantACookie },
      payload: { status: "accepted" }
    });
    expect(acceptRes.statusCode).toBe(200);
    return { sourceId, itemId };
  }
});
