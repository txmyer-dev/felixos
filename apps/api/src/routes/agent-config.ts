import { encryptSecret } from "@felixos/auth";
import { tenantInferenceConfigs } from "@felixos/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { sendBadRequest, sendSuccess } from "../lib/responses.js";
import { createSetGuard } from "../lib/validation.js";
import { withRequestTenant } from "./context.js";

type AgentConfigBody = {
  provider?: string;
  baseUrl?: string | null;
  apiKey?: string;
  distillationModel?: string;
  embeddingModel?: string;
  supportsTools?: boolean;
};

const isProvider = createSetGuard<"openai" | "openrouter" | "freellmapi">(
  new Set(["openai", "openrouter", "freellmapi"])
);

export const agentConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .select()
          .from(tenantInferenceConfigs)
          .where(eq(tenantInferenceConfigs.tenantId, request.tenantId))
          .limit(1)
      )
    );

    return sendSuccess(reply, row ? toView(row) : null);
  });

  fastify.put<{ Body: AgentConfigBody }>("/", async (request, reply) => {
    const body = request.body ?? {};
    if (!isProvider(body.provider)) {
      return sendBadRequest(reply, "provider is required");
    }
    if (!body.apiKey?.trim() || !body.distillationModel?.trim() || !body.embeddingModel?.trim()) {
      return sendBadRequest(reply, "apiKey, distillationModel, and embeddingModel are required");
    }

    const encrypted = encryptSecret(
      body.apiKey,
      request.server.encryptionKey,
      request.server.keyId
    );
    const values = {
      id: randomUUID(),
      tenantId: request.tenantId,
      provider: body.provider,
      baseUrl: body.baseUrl?.trim() || null,
      apiKeyCiphertext: encrypted.ciphertext,
      apiKeyNonce: encrypted.nonce,
      apiKeyKeyId: encrypted.keyId,
      distillationModel: body.distillationModel,
      embeddingModel: body.embeddingModel,
      supportsTools: body.supportsTools ?? true,
      updatedAt: new Date()
    };

    const [row] = await withRequestTenant(request, () =>
      request.server.scopedDb.transaction((tx) =>
        tx
          .insert(tenantInferenceConfigs)
          .values(values)
          .onConflictDoUpdate({
            target: tenantInferenceConfigs.tenantId,
            set: {
              provider: values.provider,
              baseUrl: values.baseUrl,
              apiKeyCiphertext: values.apiKeyCiphertext,
              apiKeyNonce: values.apiKeyNonce,
              apiKeyKeyId: values.apiKeyKeyId,
              distillationModel: values.distillationModel,
              embeddingModel: values.embeddingModel,
              supportsTools: values.supportsTools,
              updatedAt: values.updatedAt
            }
          })
          .returning()
      )
    );

    return sendSuccess(reply, toView(row!));
  });
};

function toView(row: typeof tenantInferenceConfigs.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: maskKey(row.apiKeyCiphertext),
    distillationModel: row.distillationModel,
    embeddingModel: row.embeddingModel,
    supportsTools: row.supportsTools,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function maskKey(ciphertext: string): string {
  return ciphertext.length > 0 ? "configured" : "missing";
}
