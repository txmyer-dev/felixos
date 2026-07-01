import { generateTotpCode, provisionTenant, readTotpEncryptionKey } from "@felixos/auth";
import {
  createPrivilegedDatabaseClient,
  createScopedDatabaseClient,
  createSqlClient,
  type DatabaseSql
} from "@felixos/db";
import {
  createDbTrustLadderStore,
  createN8nWorkflowSkills,
  invokeThroughTrustLadder
} from "@felixos/agent";
import { N8nUnavailableError, type N8nClient } from "@felixos/integrations";
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

function createStubLlm(): LlmShim {
  return {
    embeddingModel: "test-embedding",
    async distill() {
      return [];
    },
    async embed() {
      return Array.from({ length: 1024 }, () => 0);
    }
  };
}

type N8nCall = {
  method: string;
  filters?: unknown;
  id?: string;
};

function createStubN8n(calls: N8nCall[] = []): N8nClient {
  return {
    baseUrl: "https://n8n.example.test",
    async listWorkflows(filters) {
      calls.push({ method: "listWorkflows", filters });
      return {
        items: [
          { id: "wf-a", name: "Tenant A workflow", active: true },
          { id: "wf-b", name: "Tenant B workflow", active: false }
        ],
        nextCursor: null
      };
    },
    async getWorkflow(id) {
      calls.push({ method: "getWorkflow", id });
      if (id === "missing") return undefined;
      return { id, name: id === "wf-a" ? "Tenant A workflow" : "Tenant B workflow", active: true };
    },
    async activateWorkflow(id) {
      calls.push({ method: "activateWorkflow", id });
      return { id, name: id, active: true };
    },
    async deactivateWorkflow(id) {
      calls.push({ method: "deactivateWorkflow", id });
      return { id, name: id, active: false };
    },
    async listExecutions(filters) {
      calls.push({ method: "listExecutions", filters });
      const status = filters?.status;
      const items = [
        {
          id: "ex-a-error",
          workflowId: "wf-a",
          workflowName: "Tenant A workflow",
          status: "error" as const,
          stoppedAt: "2026-06-30T12:00:00.000Z",
          error: { message: "A failed" }
        },
        {
          id: "ex-b-error",
          workflowId: "wf-b",
          workflowName: "Tenant B workflow",
          status: "error" as const,
          stoppedAt: "2026-06-30T12:05:00.000Z",
          error: { message: "B failed" }
        }
      ];
      return {
        items: status === "crashed" ? [] : items,
        nextCursor: null
      };
    },
    async getExecution(id) {
      calls.push({ method: "getExecution", id });
      if (id === "missing") return undefined;
      return { id, workflowId: "wf-a", status: "error" };
    },
    async retryExecution(id) {
      calls.push({ method: "retryExecution", id });
      return { id, status: "running" };
    },
    async stopExecution(id) {
      calls.push({ method: "stopExecution", id });
      return { id, status: "canceled" };
    }
  };
}

describe.skipIf(!databaseUrl || !privilegedDatabaseUrl)("n8n phase integration", () => {
  const encryptionKey = readTotpEncryptionKey(rawKey);
  const schemaName = `felixos_n8n_${randomUUID().replaceAll("-", "_")}`;
  const scopedRoleName = `felixos_n8n_app_${randomUUID().replaceAll("-", "_")}`;
  const scopedRolePassword = randomBytes(18).toString("base64url");
  const n8nCalls: N8nCall[] = [];
  const n8n = createStubN8n(n8nCalls);
  let server: ReturnType<typeof buildServer>;
  let privilegedDb: ReturnType<typeof createPrivilegedDatabaseClient>;
  let scopedDb: ReturnType<typeof createScopedDatabaseClient>;
  let privilegedSchemaUrl: string;
  let scopedSchemaUrl: string;
  let tenantACookie: string;
  let tenantBCookie: string;
  let tenantAId: string;
  let webhookCalls: Array<{ headers: Headers; body: unknown }> = [];
  const webhookFetch: typeof fetch = async (_input, init) => {
    webhookCalls.push({
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}"))
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

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

    privilegedSchemaUrl = withSearchPath(privilegedDatabaseUrl!, schemaName);
    scopedSchemaUrl = withSearchPath(
      withCredentials(databaseUrl!, scopedRoleName, scopedRolePassword),
      schemaName
    );

    server = buildServer({
      databaseUrl: scopedSchemaUrl,
      privilegedDatabaseUrl: privilegedSchemaUrl,
      encryptionKey,
      llm: createStubLlm(),
      n8n,
      n8nWebhookFetch: webhookFetch,
      logger: false
    });
    privilegedDb = createPrivilegedDatabaseClient(privilegedSchemaUrl);
    scopedDb = createScopedDatabaseClient(scopedSchemaUrl);
    await server.ready();

    const tenantA = await provisionAndLogin("n8n-a");
    tenantACookie = tenantA.cookie;
    tenantAId = tenantA.tenantId;

    const tenantB = await provisionAndLogin("n8n-b");
    tenantBCookie = tenantB.cookie;

    // Registering wf-a/wf-b against their owning tenants up front lets every
    // test below rely on the workflow/execution proxy routes being scoped to
    // the calling tenant's registered n8n workflows.
    await server.inject({
      method: "POST",
      url: "/n8n/skills",
      headers: { cookie: tenantACookie },
      payload: {
        n8nWorkflowId: "wf-a",
        skillName: "tenant-a-primary",
        webhookUrl: "https://n8n.example.test/webhook/tenant-a-primary"
      }
    });
    await server.inject({
      method: "POST",
      url: "/n8n/skills",
      headers: { cookie: tenantBCookie },
      payload: {
        n8nWorkflowId: "wf-b",
        skillName: "tenant-b-primary",
        webhookUrl: "https://n8n.example.test/webhook/tenant-b-primary"
      }
    });
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

  it("rejects unauthenticated n8n routes", async () => {
    for (const request of [
      { method: "GET", url: "/n8n/workflows" },
      { method: "GET", url: "/n8n/skills" },
      { method: "GET", url: "/n8n/needs-attention" }
    ] as const) {
      const res = await server.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it("proxies management workflow and execution filters, scoped to the tenant's own workflows", async () => {
    const workflows = await server.inject({
      method: "GET",
      url: "/n8n/workflows?active=true&name=Tenant&limit=2",
      headers: { cookie: tenantACookie }
    });
    expect(workflows.statusCode).toBe(200);
    expect(workflows.json().data.items).toHaveLength(1);
    expect(workflows.json().data.items[0].id).toBe("wf-a");

    const executions = await server.inject({
      method: "GET",
      url: "/n8n/executions?status=error&workflowId=wf-a",
      headers: { cookie: tenantACookie }
    });
    expect(executions.statusCode).toBe(200);
    expect(executions.json().data.items[0].id).toBe("ex-a-error");

    expect(n8nCalls).toEqual(
      expect.arrayContaining([
        { method: "listWorkflows", filters: { active: true, name: "Tenant", limit: 2 } },
        { method: "listExecutions", filters: { status: "error", workflowId: "wf-a", limit: 100 } }
      ])
    );
  });

  it("returns 404 for missing workflow or execution detail", async () => {
    const workflow = await server.inject({
      method: "GET",
      url: "/n8n/workflows/missing",
      headers: { cookie: tenantACookie }
    });
    expect(workflow.statusCode).toBe(404);

    const execution = await server.inject({
      method: "GET",
      url: "/n8n/executions/missing",
      headers: { cookie: tenantACookie }
    });
    expect(execution.statusCode).toBe(404);
  });

  it("does not leak another tenant's n8n workflows or executions through the proxy routes", async () => {
    const workflowsAsB = await server.inject({
      method: "GET",
      url: "/n8n/workflows",
      headers: { cookie: tenantBCookie }
    });
    expect(workflowsAsB.json().data.items.map((row: { id: string }) => row.id)).toEqual(["wf-b"]);

    const crossTenantWorkflow = await server.inject({
      method: "GET",
      url: "/n8n/workflows/wf-a",
      headers: { cookie: tenantBCookie }
    });
    expect(crossTenantWorkflow.statusCode).toBe(404);

    const executionsAsB = await server.inject({
      method: "GET",
      url: "/n8n/executions",
      headers: { cookie: tenantBCookie }
    });
    expect(executionsAsB.json().data.items.map((row: { id: string }) => row.id)).toEqual([
      "ex-b-error"
    ]);

    const crossTenantExecution = await server.inject({
      method: "GET",
      url: "/n8n/executions/ex-a-error",
      headers: { cookie: tenantBCookie }
    });
    expect(crossTenantExecution.statusCode).toBe(404);
  });

  it("registers tenant-scoped workflow skills without returning webhook auth plaintext", async () => {
    const register = await server.inject({
      method: "POST",
      url: "/n8n/skills",
      headers: { cookie: tenantACookie },
      payload: {
        n8nWorkflowId: "wf-a",
        skillName: "sync-psa",
        webhookUrl: "https://n8n.example.test/webhook/sync-psa",
        webhookAuthHeader: "X-Workflow-Token",
        webhookAuthValue: "super-secret",
        inputSchema: {
          type: "object",
          properties: { accountId: { type: "string" } },
          required: ["accountId"]
        },
        defaultRung: "act-and-log"
      }
    });
    expect(register.statusCode).toBe(201);
    expect(JSON.stringify(register.json().data)).not.toContain("super-secret");

    const tenantAList = await server.inject({
      method: "GET",
      url: "/n8n/skills",
      headers: { cookie: tenantACookie }
    });
    expect(tenantAList.json().data.map((row: { skillName: string }) => row.skillName)).toContain(
      "sync-psa"
    );
    expect(JSON.stringify(tenantAList.json().data)).not.toContain("super-secret");

    const tenantBList = await server.inject({
      method: "GET",
      url: "/n8n/skills",
      headers: { cookie: tenantBCookie }
    });
    expect(
      tenantBList.json().data.map((row: { skillName: string }) => row.skillName)
    ).not.toContain("sync-psa");
  });

  it("invokes n8n workflow skills through act-and-log and draft-and-wait", async () => {
    webhookCalls = [];

    const skills = await createN8nWorkflowSkills({
      tenantId: tenantAId,
      scopedDb,
      n8nClient: n8n,
      fetchImpl: webhookFetch
    });
    const skill = skills.find((candidate) => candidate.descriptor.name === "sync-psa");
    expect(skill).toBeDefined();

    const store = createDbTrustLadderStore({ scopedDb, tenantId: tenantAId });
    const ctx = { tenantId: tenantAId, scopedDb, provider: {}, encryptionKey };
    const actOutcome = await invokeThroughTrustLadder(
      skill!,
      { accountId: "account-a" },
      ctx,
      store
    );
    expect(actOutcome.kind).toBe("executed");
    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]!.headers.get("X-Workflow-Token")).toBe("super-secret");
    expect(webhookCalls[0]!.body).toEqual({ accountId: "account-a" });

    await server.inject({
      method: "PUT",
      url: "/agent/rungs/sync-psa",
      headers: { cookie: tenantACookie },
      payload: { rung: "draft-and-wait" }
    });
    const draftOutcome = await invokeThroughTrustLadder(
      skill!,
      { accountId: "account-draft" },
      ctx,
      store
    );
    expect(draftOutcome.kind).toBe("pending");
    expect(webhookCalls).toHaveLength(1);

    const pendingId = "id" in draftOutcome ? draftOutcome.id : "";
    const approve = await server.inject({
      method: "POST",
      url: `/agent/pending/${pendingId}/approve`,
      headers: { cookie: tenantACookie }
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe("executed");
    expect(webhookCalls).toHaveLength(2);
    expect(webhookCalls[1]!.body).toEqual({ accountId: "account-draft" });
  });

  it("surfaces tenant-scoped failed executions and acknowledges them idempotently", async () => {
    await server.inject({
      method: "POST",
      url: "/n8n/skills",
      headers: { cookie: tenantBCookie },
      payload: {
        n8nWorkflowId: "wf-b",
        skillName: "tenant-b-flow",
        webhookUrl: "https://n8n.example.test/webhook/tenant-b"
      }
    });

    const tenantANeeds = await server.inject({
      method: "GET",
      url: "/n8n/needs-attention",
      headers: { cookie: tenantACookie }
    });
    expect(tenantANeeds.statusCode).toBe(200);
    expect(tenantANeeds.json().data).toEqual([
      expect.objectContaining({
        workflowName: "Tenant A workflow",
        n8nWorkflowId: "wf-a",
        executionId: "ex-a-error",
        errorSummary: "A failed",
        n8nUrl: "https://n8n.example.test/execution/ex-a-error"
      })
    ]);

    const ack = await server.inject({
      method: "POST",
      url: "/n8n/executions/ex-a-error/acknowledge",
      headers: { cookie: tenantACookie }
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().data.alreadyAcknowledged).toBe(false);

    const ackAgain = await server.inject({
      method: "POST",
      url: "/n8n/executions/ex-a-error/acknowledge",
      headers: { cookie: tenantACookie }
    });
    expect(ackAgain.statusCode).toBe(200);
    expect(ackAgain.json().data.alreadyAcknowledged).toBe(true);

    const afterAck = await server.inject({
      method: "GET",
      url: "/n8n/needs-attention",
      headers: { cookie: tenantACookie }
    });
    expect(afterAck.json().data).toEqual([]);

    const tenantBNeeds = await server.inject({
      method: "GET",
      url: "/n8n/needs-attention",
      headers: { cookie: tenantBCookie }
    });
    expect(
      tenantBNeeds.json().data.map((item: { executionId: string }) => item.executionId)
    ).toEqual(["ex-b-error"]);
  });

  it("confirms n8n tables are RLS-enabled and forced", async () => {
    const rows = await privilegedDb.sql<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace = ${schemaName}::regnamespace
        AND relname = ANY(${["tenant_n8n_skills", "n8n_execution_acknowledgments"]})
      ORDER BY relname
    `;

    expect(rows).toEqual([
      {
        relname: "n8n_execution_acknowledgments",
        relrowsecurity: true,
        relforcerowsecurity: true
      },
      { relname: "tenant_n8n_skills", relrowsecurity: true, relforcerowsecurity: true }
    ]);
  });

  it("returns 503 when n8n is unavailable", async () => {
    const unavailableServer = buildServer({
      databaseUrl: scopedSchemaUrl,
      privilegedDatabaseUrl: privilegedSchemaUrl,
      encryptionKey,
      llm: createStubLlm(),
      n8n: {
        ...n8n,
        async listWorkflows() {
          throw new N8nUnavailableError("n8n unavailable");
        }
      },
      logger: false
    });
    await unavailableServer.ready();

    const res = await unavailableServer.inject({
      method: "GET",
      url: "/n8n/workflows",
      headers: { cookie: tenantACookie }
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("n8n_unavailable");

    await unavailableServer.close();
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
