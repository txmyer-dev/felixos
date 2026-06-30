import { decryptSecret, type EncryptedSecret } from "@felixos/auth";
import { tenantInferenceConfigs, type ScopedDatabaseClient } from "@felixos/db";
import { eq } from "drizzle-orm";

export type InferenceProviderName = "openai" | "openrouter" | "freellmapi";

export type TenantInferenceConfig = {
  provider: InferenceProviderName;
  baseUrl: string | null;
  apiKeyCiphertext: string;
  apiKeyNonce: string;
  apiKeyKeyId: string;
  distillationModel: string;
  embeddingModel: string;
  supportsTools: boolean;
};

export type ResolvedInferenceProvider = {
  provider: InferenceProviderName | "env";
  apiKey: string;
  model: string;
  baseURL?: string;
  distillationModel: string;
  embeddingModel: string;
  supportsTools: boolean;
};

export function createProviderFromConfig(
  config: TenantInferenceConfig,
  encryptionKey: Buffer
): ResolvedInferenceProvider {
  const encrypted: EncryptedSecret = {
    ciphertext: config.apiKeyCiphertext,
    nonce: config.apiKeyNonce,
    keyId: config.apiKeyKeyId
  };
  const base = {
    provider: config.provider,
    apiKey: decryptSecret(encrypted, encryptionKey),
    model: config.distillationModel,
    distillationModel: config.distillationModel,
    embeddingModel: config.embeddingModel,
    supportsTools: config.supportsTools
  };

  return config.baseUrl ? { ...base, baseURL: config.baseUrl } : base;
}

export function createEnvFallbackProvider(): ResolvedInferenceProvider {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || undefined;
  const distillationModel = process.env.DISTILLATION_MODEL;
  const embeddingModel = process.env.EMBEDDING_MODEL;

  if (!apiKey || !distillationModel || !embeddingModel) {
    throw new Error("LLM_API_KEY, DISTILLATION_MODEL, and EMBEDDING_MODEL are required");
  }

  const base = {
    provider: "env" as const,
    apiKey,
    model: distillationModel,
    distillationModel,
    embeddingModel,
    supportsTools: true
  };

  return baseURL ? { ...base, baseURL } : base;
}

export async function resolveInferenceProvider(opts: {
  scopedDb: ScopedDatabaseClient;
  tenantId: string;
  encryptionKey: Buffer;
}): Promise<ResolvedInferenceProvider> {
  const [config] = await opts.scopedDb.transaction((tx) =>
    tx
      .select()
      .from(tenantInferenceConfigs)
      .where(eq(tenantInferenceConfigs.tenantId, opts.tenantId))
      .limit(1)
  );

  if (!config) {
    return createEnvFallbackProvider();
  }

  return createProviderFromConfig(config, opts.encryptionKey);
}
