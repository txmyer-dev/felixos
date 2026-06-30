import { describe, expect, it } from "vitest";

import type { ModelProvider } from "@openai/agents";

import { runAgent, type AgentRunOptions, type AgentTool } from "./runner.js";

describe("runAgent", () => {
  it("runs the OpenAI agent boundary with tenant context and provider config", async () => {
    const createdAgent = { id: "agent" };
    const createdModelProvider = { id: "model-provider" };
    const calls: unknown[] = [];

    const opts = baseOptions({
      entityId: "entity-1",
      tools: [{} as AgentTool]
    });

    const result = await runAgent(opts, {
      createAgent(config) {
        calls.push(["createAgent", config]);
        return createdAgent;
      },
      createModelProvider(provider) {
        calls.push(["createModelProvider", provider]);
        return createdModelProvider as unknown as ModelProvider;
      },
      async run(agent, input, options) {
        calls.push(["run", agent, input, options]);
        return { finalOutput: "Here is the plan." };
      }
    });

    expect(result).toEqual({ response: "Here is the plan.", pendingActionIds: [] });
    expect(calls).toEqual([
      [
        "createAgent",
        expect.objectContaining({
          model: "gpt-test",
          tools: opts.tools
        })
      ],
      ["createModelProvider", opts.provider],
      [
        "run",
        createdAgent,
        "What changed today?",
        expect.objectContaining({
          context: { tenantId: "tenant-1", entityId: "entity-1" },
          maxTurns: 8,
          modelProvider: createdModelProvider,
          tracingDisabled: true,
          traceIncludeSensitiveData: false
        })
      ]
    ]);
  });

  it("rejects tools when the provider cannot call tools", async () => {
    await expect(
      runAgent(
        baseOptions({
          provider: {
            apiKey: "test-key",
            model: "gpt-test",
            supportsTools: false
          },
          tools: [{} as AgentTool]
        })
      )
    ).rejects.toThrow("Configured inference provider does not support tool calls");
  });
});

function baseOptions(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
  return {
    query: "What changed today?",
    provider: {
      apiKey: "test-key",
      model: "gpt-test",
      baseURL: "https://llm.example.test/v1",
      supportsTools: true
    },
    tenantId: "tenant-1",
    ...overrides
  };
}
