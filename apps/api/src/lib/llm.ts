import OpenAI from "openai";

import type { DistilledItemType, KnowledgeSourceType } from "@felixos/shared-types";

export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmError";
  }
}

export type DistilledDraft = {
  type: DistilledItemType;
  content: string;
};

export type LlmShim = {
  distill(content: string, sourceType: KnowledgeSourceType): Promise<DistilledDraft[]>;
  embed(text: string): Promise<number[]>;
  embeddingModel: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

type LlmApiClient = {
  chat: {
    completions: {
      create(input: unknown): Promise<ChatCompletionResponse>;
    };
  };
  embeddings: {
    create(input: unknown): Promise<EmbeddingResponse>;
  };
};

const distilledItemTypes = new Set<DistilledItemType>(["fact", "decision", "action"]);

export function createEnvLlmShim(): LlmShim {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || undefined;
  const distillationModel = process.env.DISTILLATION_MODEL;
  const embeddingModel = process.env.EMBEDDING_MODEL;

  if (!apiKey || !distillationModel || !embeddingModel) {
    throw new Error("LLM_API_KEY, DISTILLATION_MODEL, and EMBEDDING_MODEL are required");
  }

  return createOpenAiLlmShim({
    client: new OpenAI({ apiKey, baseURL }) as unknown as LlmApiClient,
    distillationModel,
    embeddingModel
  });
}

export function createOpenAiLlmShim(opts: {
  client: LlmApiClient;
  distillationModel: string;
  embeddingModel: string;
}): LlmShim {
  return {
    embeddingModel: opts.embeddingModel,
    async distill(content, sourceType) {
      let completion: ChatCompletionResponse;
      try {
        completion = await opts.client.chat.completions.create({
          model: opts.distillationModel,
          messages: [
            {
              role: "system",
              content:
                "Extract MSP business knowledge as JSON only: an array of objects with type fact, decision, or action and a content string. Return [] if there is nothing useful."
            },
            {
              role: "user",
              content: `Source type: ${sourceType}\n\nContent:\n${content}`
            }
          ],
          temperature: 0
        });
      } catch (error) {
        throw new LlmError(
          error instanceof Error ? error.message : "Distillation request failed",
          { cause: error }
        );
      }

      return parseDistillationCompletion(completion.choices?.[0]?.message?.content);
    },
    async embed(text) {
      let response: EmbeddingResponse;
      try {
        response = await opts.client.embeddings.create({
          model: opts.embeddingModel,
          input: text
        });
      } catch (error) {
        throw new LlmError(
          error instanceof Error ? error.message : "Embedding request failed",
          { cause: error }
        );
      }
      const embedding = response.data?.[0]?.embedding;
      if (!embedding) {
        throw new LlmError("Embedding provider returned no embedding");
      }
      return validateEmbeddingDimensions(embedding);
    }
  };
}

export function parseDistillationCompletion(content: string | null | undefined): DistilledDraft[] {
  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new LlmError(
      `Distillation returned unparseable response: ${content.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item): DistilledDraft[] => {
    if (!isDistilledDraftLike(item)) return [];
    return [{ type: item.type, content: item.content.trim() }];
  });
}

export function validateEmbeddingDimensions(embedding: number[]): number[] {
  if (embedding.length !== 1024) {
    throw new Error(`Embedding model returned ${embedding.length} dimensions; expected 1024`);
  }
  return embedding;
}

function isDistilledDraftLike(item: unknown): item is DistilledDraft {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { type?: unknown; content?: unknown };
  return (
    typeof candidate.type === "string" &&
    distilledItemTypes.has(candidate.type as DistilledItemType) &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0
  );
}
