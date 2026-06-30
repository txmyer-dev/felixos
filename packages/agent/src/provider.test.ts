import { randomBytes } from "node:crypto";

import { encryptSecret } from "@felixos/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEnvFallbackProvider,
  createProviderFromConfig,
  resolveInferenceProvider
} from "./provider.js";

import type { ScopedDatabaseClient } from "@felixos/db";

describe("inference provider resolution", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  it("decrypts DB-backed provider API keys", () => {
    const encryptionKey = randomBytes(32);
    const encrypted = encryptSecret("db-provider-key", encryptionKey, "agent-config");

    const provider = createProviderFromConfig(
      {
        provider: "openrouter",
        baseUrl: "https://openrouter.example.test/api/v1",
        apiKeyCiphertext: encrypted.ciphertext,
        apiKeyNonce: encrypted.nonce,
        apiKeyKeyId: encrypted.keyId,
        distillationModel: "openrouter/model",
        embeddingModel: "embedding-model",
        supportsTools: false
      },
      encryptionKey
    );

    expect(provider).toEqual({
      provider: "openrouter",
      apiKey: "db-provider-key",
      baseURL: "https://openrouter.example.test/api/v1",
      model: "openrouter/model",
      distillationModel: "openrouter/model",
      embeddingModel: "embedding-model",
      supportsTools: false
    });
  });

  it("falls back to env-var provider config", () => {
    vi.stubEnv("LLM_API_KEY", "env-provider-key");
    vi.stubEnv("LLM_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("DISTILLATION_MODEL", "gpt-test");
    vi.stubEnv("EMBEDDING_MODEL", "embedding-test");

    expect(createEnvFallbackProvider()).toEqual({
      provider: "env",
      apiKey: "env-provider-key",
      baseURL: "https://llm.example.test/v1",
      model: "gpt-test",
      distillationModel: "gpt-test",
      embeddingModel: "embedding-test",
      supportsTools: true
    });
  });

  it("resolves env fallback when no tenant config row exists", async () => {
    vi.stubEnv("LLM_API_KEY", "env-provider-key");
    vi.stubEnv("DISTILLATION_MODEL", "gpt-test");
    vi.stubEnv("EMBEDDING_MODEL", "embedding-test");

    const scopedDb = {
      async transaction(callback: (tx: unknown) => Promise<unknown>) {
        const tx = {
          select() {
            return {
              from() {
                return {
                  where() {
                    return {
                      async limit() {
                        return [];
                      }
                    };
                  }
                };
              }
            };
          }
        };
        return callback(tx);
      }
    } as unknown as ScopedDatabaseClient;

    await expect(
      resolveInferenceProvider({
        scopedDb,
        tenantId: "tenant-1",
        encryptionKey: randomBytes(32)
      })
    ).resolves.toMatchObject({
      provider: "env",
      apiKey: "env-provider-key",
      distillationModel: "gpt-test",
      embeddingModel: "embedding-test"
    });
  });
});
