import { describe, expect, it } from "vitest";

import {
  createOpenAiLlmShim,
  parseDistillationCompletion,
  validateEmbeddingDimensions
} from "./llm.js";

describe("LLM shim", () => {
  it("parses valid distillation JSON and filters unknown item types", () => {
    expect(
      parseDistillationCompletion(
        JSON.stringify([
          { type: "fact", content: " Acme uses FelixOS. " },
          { type: "noise", content: "skip me" },
          { type: "action", content: "" },
          { type: "decision", content: "Proceed with onboarding." }
        ])
      )
    ).toEqual([
      { type: "fact", content: "Acme uses FelixOS." },
      { type: "decision", content: "Proceed with onboarding." }
    ]);
  });

  it("returns an empty array for empty or unparseable distillation output", () => {
    expect(parseDistillationCompletion("")).toEqual([]);
    expect(parseDistillationCompletion("not json")).toEqual([]);
    expect(parseDistillationCompletion(JSON.stringify({ type: "fact" }))).toEqual([]);
  });

  it("validates 1024-dim embeddings", () => {
    const embedding = Array.from({ length: 1024 }, () => 0);
    expect(validateEmbeddingDimensions(embedding)).toBe(embedding);
    expect(() => validateEmbeddingDimensions([1, 2, 3])).toThrow(
      "Embedding model returned 3 dimensions; expected 1024"
    );
  });

  it("exposes a structurally swappable shim", async () => {
    const shim = createOpenAiLlmShim({
      distillationModel: "distill-model",
      embeddingModel: "embed-model",
      client: {
        chat: {
          completions: {
            async create() {
              return {
                choices: [
                  {
                    message: {
                      content: JSON.stringify([{ type: "fact", content: "A useful fact." }])
                    }
                  }
                ]
              };
            }
          }
        },
        embeddings: {
          async create() {
            return { data: [{ embedding: Array.from({ length: 1024 }, () => 0) }] };
          }
        }
      }
    });

    await expect(shim.distill("content", "note")).resolves.toEqual([
      { type: "fact", content: "A useful fact." }
    ]);
    await expect(shim.embed("query")).resolves.toHaveLength(1024);
  });
});
