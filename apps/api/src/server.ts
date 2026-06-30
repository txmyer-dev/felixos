import { createPrivilegedDatabaseClient, createScopedDatabaseClient } from "@felixos/db";
import Fastify from "fastify";
import fp from "fastify-plugin";

import { authMiddleware } from "./middleware/auth.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { createEnvLlmShim } from "./lib/llm.js";
import { agentConfigRoutes } from "./routes/agent-config.js";
import { authRoutes } from "./routes/auth.js";
import { contactRoutes } from "./routes/contacts.js";
import { dealRoutes } from "./routes/deals.js";
import { entityRoutes } from "./routes/entities.js";
import { interactionRoutes } from "./routes/interactions.js";
import { knowledgeRoutes } from "./routes/knowledge.js";

import type { PrivilegedDatabaseClient, ScopedDatabaseClient } from "@felixos/db";
import type { LlmShim } from "./lib/llm.js";

type DatabaseClientOptions = Parameters<typeof createScopedDatabaseClient>[1];

declare module "fastify" {
  interface FastifyInstance {
    privilegedDb: PrivilegedDatabaseClient;
    scopedDb: ScopedDatabaseClient;
    llm: LlmShim;
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
  logger?: boolean;
}) {
  const fastify = Fastify({ logger: opts.logger ?? false });

  const privilegedDb = createPrivilegedDatabaseClient(
    opts.privilegedDatabaseUrl,
    opts.privilegedDatabaseOptions
  );
  const scopedDb = createScopedDatabaseClient(opts.databaseUrl, opts.databaseOptions);
  const llm = opts.llm ?? createEnvLlmShim();

  fastify.register(
    fp(async (f) => {
      f.decorate("privilegedDb", privilegedDb);
      f.decorate("scopedDb", scopedDb);
      f.decorate("llm", llm);
      f.decorate("encryptionKey", opts.encryptionKey);
      f.decorate("keyId", opts.keyId ?? "default");
    })
  );

  fastify.register(authMiddleware);
  fastify.register(tenantMiddleware);

  fastify.get("/health", async () => ({ ok: true }));

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(agentConfigRoutes, { prefix: "/agent/config" });
  fastify.register(entityRoutes, { prefix: "/entities" });
  fastify.register(contactRoutes, { prefix: "/contacts" });
  fastify.register(dealRoutes, { prefix: "/deals" });
  fastify.register(interactionRoutes, { prefix: "/interactions" });
  fastify.register(knowledgeRoutes, { prefix: "/knowledge" });

  fastify.addHook("onClose", async () => {
    await Promise.all([privilegedDb.end(), scopedDb.end()]);
  });

  return fastify;
}
