import { createPrivilegedDatabaseClient, createScopedDatabaseClient } from "@felixos/db";
import { N8nUnavailableError, createEnvN8nClient } from "@felixos/integrations";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import fp from "fastify-plugin";

import { authMiddleware } from "./middleware/auth.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { createEnvLlmShim } from "./lib/llm.js";
import { agentConfigRoutes } from "./routes/agent-config.js";
import { agentRoutes } from "./routes/agent.js";
import { authRoutes } from "./routes/auth.js";
import { contactRoutes } from "./routes/contacts.js";
import { dealRoutes } from "./routes/deals.js";
import { entityRoutes } from "./routes/entities.js";
import { interactionRoutes } from "./routes/interactions.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { n8nRoutes } from "./routes/n8n.js";
import { n8nSkillRoutes } from "./routes/n8n-skills.js";

import type { PrivilegedDatabaseClient, ScopedDatabaseClient } from "@felixos/db";
import type { N8nClient } from "@felixos/integrations";
import type { LlmShim } from "./lib/llm.js";

type DatabaseClientOptions = Parameters<typeof createScopedDatabaseClient>[1];

declare module "fastify" {
  interface FastifyInstance {
    privilegedDb: PrivilegedDatabaseClient;
    scopedDb: ScopedDatabaseClient;
    llm: LlmShim;
    n8n: N8nClient;
    n8nWebhookFetch?: typeof fetch;
    encryptionKey: Buffer;
    keyId: string;
  }
}

export function buildServer(opts: {
  databaseUrl: string;
  privilegedDatabaseUrl: string;
  encryptionKey: Buffer;
  keyId?: string;
  databaseOptions?: DatabaseClientOptions;
  privilegedDatabaseOptions?: DatabaseClientOptions;
  llm?: LlmShim;
  n8n?: N8nClient;
  n8nWebhookFetch?: typeof fetch;
  logger?: boolean;
}) {
  const fastify = Fastify({ logger: opts.logger ?? false });

  const privilegedDb = createPrivilegedDatabaseClient(
    opts.privilegedDatabaseUrl,
    opts.privilegedDatabaseOptions
  );
  const scopedDb = createScopedDatabaseClient(opts.databaseUrl, opts.databaseOptions);
  const llm = opts.llm ?? createEnvLlmShim();
  const n8n = opts.n8n ?? createOptionalEnvN8nClient();

  fastify.register(
    fp(async (f) => {
      f.decorate("privilegedDb", privilegedDb);
      f.decorate("scopedDb", scopedDb);
      f.decorate("llm", llm);
      f.decorate("n8n", n8n);
      if (opts.n8nWebhookFetch) {
        f.decorate("n8nWebhookFetch", opts.n8nWebhookFetch);
      }
      f.decorate("encryptionKey", opts.encryptionKey);
      f.decorate("keyId", opts.keyId ?? "default");
    })
  );

  fastify.register(rateLimit, {
    global: false
  });

  fastify.register(authMiddleware);
  fastify.register(tenantMiddleware);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(agentConfigRoutes, { prefix: "/agent/config" });
  fastify.register(agentRoutes, { prefix: "/agent" });
  fastify.register(entityRoutes, { prefix: "/entities" });
  fastify.register(contactRoutes, { prefix: "/contacts" });
  fastify.register(dealRoutes, { prefix: "/deals" });
  fastify.register(interactionRoutes, { prefix: "/interactions" });
  fastify.register(knowledgeRoutes, { prefix: "/knowledge" });
  fastify.register(n8nRoutes, { prefix: "/n8n" });
  fastify.register(n8nSkillRoutes, { prefix: "/n8n/skills" });

  fastify.addHook("onClose", async () => {
    await Promise.all([privilegedDb.end(), scopedDb.end()]);
  });

  return fastify;
}

function createOptionalEnvN8nClient(): N8nClient {
  try {
    return createEnvN8nClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "n8n is not configured";
    return createUnavailableN8nClient(message);
  }
}

function createUnavailableN8nClient(message: string): N8nClient {
  async function unavailable(): Promise<never> {
    throw new N8nUnavailableError(message);
  }

  return {
    baseUrl: process.env.N8N_BASE_URL ?? "",
    listWorkflows: unavailable,
    getWorkflow: unavailable,
    activateWorkflow: unavailable,
    deactivateWorkflow: unavailable,
    listExecutions: unavailable,
    getExecution: unavailable,
    retryExecution: unavailable,
    stopExecution: unavailable
  };
}
