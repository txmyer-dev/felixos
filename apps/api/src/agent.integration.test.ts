import { generateTotpCode, provisionTenant, readTotpEncryptionKey } from "@felixos/auth";
import {
  createPrivilegedDatabaseClient,
  createScopedDatabaseClient,
  createSqlClient,
  type DatabaseSql
} from "@felixos/db";
import {
  defaultRegistry,
  createDbTrustLadderStore,
  DraftEmailSkill,
  DocNoteCaptureSkill,
  invokeThroughTrustLadder,
  getEffectiveRung
} from "@felixos/agent";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
  new URL("../../../packages/db/migrations/0003_knowledge_rls.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0004_agent_schema.sql", import.meta.url),
  new URL("../../../packages/db/migrations/0005_agent_rls.sql", import.meta.url)
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

function createStubLlm(): LlmShim {
  return {
    embeddingModel: "test-embedding",
    async distill() {
      return [{ type: "fact", content: "stub fact" }];
    },
    async embed() {
      return Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
    }
  };
}

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl)("Agent phase-gate integration", () => {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  const schemaName = `felixos_agent_${randomUUID().replaceAll("-", "_")}`;
  const scopedRoleName = `felixos_agent_app_${randomUUID().replaceAll("-", "_")}`;
  const scopedRolePassword = randomBytes(18).toString("base64url");
  const llm = createStubLlm();
  let server: ReturnType<typeof buildServer>;
  let privilegedDb: ReturnType<typeof createPrivilegedDatabaseClient>;
  let scopedDb: ReturnType<typeof createScopedDatabaseClient>;
  let tenantACookie: string;
  let tenantBCookie: string;
  let tenantAId: string;

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

    const resultA = await provisionAndLogin("agent-a");
    tenantACookie = resultA.cookie;
    tenantAId = resultA.tenantId;

    const resultB = await provisionAndLogin("agent-b");
    tenantBCookie = resultB.cookie;
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

  it("rejects unauthenticated agent requests", async () => {
    for (const request of [
      { method: "GET", url: "/agent/pending" },
      { method: "POST", url: "/agent/pending/fake-id/approve" },
      { method: "POST", url: "/agent/pending/fake-id/reject" },
      { method: "PUT", url: "/agent/rungs/draft-email", payload: { rung: "act-and-log" } }
    ] as const) {
      const res = await server.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it("trust ladder — draft-and-wait does not execute skill and creates pending_actions row", async () => {
    const store = createDbTrustLadderStore({
      scopedDb,
      tenantId: tenantAId
    });

    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };
    const executeSpy = vi.spyOn(DraftEmailSkill, "execute");

    const outcome = await invokeThroughTrustLadder(
      DraftEmailSkill,
      { to: "client@example.com", subject: "Hello", body: "Hi there" },
      ctx,
      store
    );

    expect(outcome.kind).toBe("pending");
    expect("id" in outcome && outcome.id).toBeTruthy();
    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();

    const listRes = await server.inject({
      method: "GET",
      url: "/agent/pending",
      headers: { cookie: tenantACookie }
    });
    expect(listRes.statusCode).toBe(200);
    const pending = listRes.json().data;
    expect(pending.some((p: { id: string }) => "id" in outcome && p.id === outcome.id)).toBe(true);
  });

  it("trust ladder — approval of DraftEmailSkill sets status to approved", async () => {
    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };

    const outcome = await invokeThroughTrustLadder(
      DraftEmailSkill,
      { to: "x@example.com", subject: "Approve test", body: "Body" },
      ctx,
      store
    );
    expect(outcome.kind).toBe("pending");
    const id = "id" in outcome ? outcome.id : "";

    const approveRes = await server.inject({
      method: "POST",
      url: `/agent/pending/${id}/approve`,
      headers: { cookie: tenantACookie }
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().data.status).toBe("approved");

    const doubleApprove = await server.inject({
      method: "POST",
      url: `/agent/pending/${id}/approve`,
      headers: { cookie: tenantACookie }
    });
    expect(doubleApprove.statusCode).toBe(409);
  });

  it("trust ladder — approval of CreateTaskSkill inserts interaction and sets status to executed", async () => {
    const entityRes = await server.inject({
      method: "POST",
      url: "/entities",
      headers: { cookie: tenantACookie },
      payload: { name: "Task Entity", lifecycleStage: "prospect" }
    });
    expect(entityRes.statusCode).toBe(201);
    const accountId = entityRes.json().data.id;

    const createTaskSkill = defaultRegistry.get("create-task");
    expect(createTaskSkill).toBeDefined();

    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };

    const outcome = await invokeThroughTrustLadder(
      createTaskSkill!,
      { accountId, summary: "Follow up call" },
      ctx,
      store
    );
    expect(outcome.kind).toBe("pending");
    const id = "id" in outcome ? outcome.id : "";

    const approveRes = await server.inject({
      method: "POST",
      url: `/agent/pending/${id}/approve`,
      headers: { cookie: tenantACookie }
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().data.status).toBe("executed");

    const interactionsRes = await server.inject({
      method: "GET",
      url: `/interactions?accountId=${accountId}`,
      headers: { cookie: tenantACookie }
    });
    expect(interactionsRes.statusCode).toBe(200);
    const tasks = interactionsRes.json().data.filter(
      (i: { kind: string; summary: string }) => i.kind === "task" && i.summary === "Follow up call"
    );
    expect(tasks).toHaveLength(1);
  });

  it("trust ladder bypass — Tenant B cannot approve Tenant A pending action (404 via RLS)", async () => {
    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };

    const outcome = await invokeThroughTrustLadder(
      DraftEmailSkill,
      { to: "iso@example.com", subject: "Isolation test", body: "Body" },
      ctx,
      store
    );
    expect(outcome.kind).toBe("pending");
    const id = "id" in outcome ? outcome.id : "";

    const crossTenantApprove = await server.inject({
      method: "POST",
      url: `/agent/pending/${id}/approve`,
      headers: { cookie: tenantBCookie }
    });
    expect(crossTenantApprove.statusCode).toBe(404);
  });

  it("capture skill isolation — Tenant B cannot see Tenant A raw_sources", async () => {
    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };

    const outcome = await invokeThroughTrustLadder(
      DocNoteCaptureSkill,
      { content: "Tenant A private document", sourceType: "doc" },
      ctx,
      store
    );
    expect(outcome.kind).toBe("executed");
    const result = "result" in outcome ? outcome.result : null;
    expect(result).toMatchObject({ tenantId: tenantAId, sourceType: "doc" });

    const sourceId = (result as { sourceId: string }).sourceId;

    const tenantBList = await server.inject({
      method: "GET",
      url: "/knowledge/sources",
      headers: { cookie: tenantBCookie }
    });
    expect(tenantBList.statusCode).toBe(200);
    const tenantBSourceIds = tenantBList.json().data.map((s: { id: string }) => s.id);
    expect(tenantBSourceIds).not.toContain(sourceId);
  });

  it("rung promotion — PUT /agent/rungs/:skillName persists the override", async () => {
    const promoteRes = await server.inject({
      method: "PUT",
      url: "/agent/rungs/draft-email",
      headers: { cookie: tenantACookie },
      payload: { rung: "act-and-log" }
    });
    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().data.rung).toBe("act-and-log");

    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {} };
    const effectiveRung = await getEffectiveRung(DraftEmailSkill, ctx, store);
    expect(effectiveRung).toBe("act-and-log");

    await server.inject({
      method: "PUT",
      url: "/agent/rungs/draft-email",
      headers: { cookie: tenantACookie },
      payload: { rung: "draft-and-wait" }
    });
  });

  it("defaultRegistry contains all four Phase 3 skills", () => {
    const names = defaultRegistry.listDescriptors().map((d) => d.name);
    expect(names).toContain("doc-note-capture");
    expect(names).toContain("youtube-capture");
    expect(names).toContain("draft-email");
    expect(names).toContain("create-task");
  });

  it("GET /agent/pending returns only pending status by default", async () => {
    const listRes = await server.inject({
      method: "GET",
      url: "/agent/pending",
      headers: { cookie: tenantACookie }
    });
    expect(listRes.statusCode).toBe(200);
    for (const item of listRes.json().data as Array<{ status: string }>) {
      expect(item.status).toBe("pending");
    }
  });

  it("POST /agent/pending/:id/reject returns 404 for nonexistent id", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/agent/pending/${randomUUID()}/reject`,
      headers: { cookie: tenantACookie }
    });
    expect(res.statusCode).toBe(404);
  });

  async function provisionAndLogin(
    slugPrefix: string
  ): Promise<{ cookie: string; tenantId: string }> {
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
    return {
      cookie: (loginRes.headers["set-cookie"] as string).split(";")[0]!,
      tenantId: enrollment.tenantId
    };
  }
});
